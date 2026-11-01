'use server';

import { revalidatePath } from 'next/cache';
import {
  requireCashier,
  requireAdmin,
  requireKitchen,
} from '@/lib/auth-helpers';
import {
  setOrderStatus,
  setOrderPayment,
  payAndComplete,
  recordDeposit,
  updateOrderItems,
  setOrderCustomer,
  updateOrderDetails,
  getOrderShortage,
  StockShortageError,
} from '@/lib/order-mutations';
import type { ShortageLine } from '@/lib/orders/shortage';
import type {
  SetOrderCustomerInput,
  UpdateOrderDetailsInput,
  OrderPaymentLineInput,
} from '@/lib/schemas/order';
import type { CartItem } from '@/lib/cart-store';
import type { OrderStatus, UserRole } from '@/generated/prisma/client';

/** Revalide la page de détail et la liste après une mutation de commande. */
function revalidateOrder(id: string): void {
  revalidatePath(`/dashboard/commandes/${id}`);
  revalidatePath('/dashboard/commandes');
  // L'ardoise (/dashboard/ardoise) liste les impayés tous jours confondus :
  // encaisser, dépayer ou annuler une commande la fait entrer ou sortir de la
  // liste. Elle appelle d'ailleurs `markOrderPaidAction` directement.
  revalidatePath('/dashboard/ardoise');
}

// Next.js redacte en production le message de toute erreur qui *traverse*
// une Server Action (générique « An error occurred in the Server
// Components render… », quel que soit le type d'erreur) : un throw ne suffit
// pas à faire remonter au caissier la vraie raison d'un refus de paiement
// (ex. `StockShortageError` — « Stock insuffisant pour « Produit — Option » »).
// Cf. app/(dashboard)/dashboard/menu/actions.ts pour le même motif appliqué
// à la sauvegarde d'un produit.
//
// Toutes les actions de ce fichier renvoient donc `{ error }` plutôt que de
// laisser l'erreur traverser : un 403 (rôle), un 409 (« État déjà modifié par
// un autre caissier ») ou une rupture de stock n'affichaient RIEN au staff, et
// le bouton semblait simplement inerte.
function formatMutationError(err: unknown): string {
  return err instanceof Error ? err.message : 'Erreur inattendue';
}

/**
 * Résultat d'échec d'une mutation. `shortage` n'est renseigné que sur une
 * pénurie : l'écran peut alors proposer « il manque N × X, vous les avez
 * produits ? » et rappeler l'action avec `coverShortage`, au lieu de renvoyer
 * le staff corriger le stock dans /dashboard/menu.
 */
export type MutationFailure = { error: string; shortage?: ShortageLine[] };

/** Enrichit l'échec des lignes manquantes quand c'est une pénurie. */
async function toFailure(id: string, err: unknown): Promise<MutationFailure> {
  const error = formatMutationError(err);
  if (err instanceof StockShortageError) {
    return { error, shortage: await getOrderShortage(id) };
  }
  return { error };
}

export async function updateOrderStatus(
  id: string,
  newStatus: OrderStatus,
  opts?: { coverShortage?: boolean }
): Promise<MutationFailure | undefined> {
  const session = await requireCashier();
  const role = session.user.role as UserRole;

  try {
    await setOrderStatus(id, newStatus, role, {
      coverShortage: opts?.coverShortage,
    });
  } catch (err) {
    return toFailure(id, err);
  }
  revalidateOrder(id);
}

export type BulkCancelResult = {
  cancelled: number;
  failed: { id: string; error: string }[];
};

/**
 * Annule plusieurs commandes en une fois (ex. commandes NEW non encaissées
 * oubliées depuis des jours — cf. `OrderSelectionProvider`). Même mutation
 * que l'annulation unitaire (`setOrderStatus`), rejouée par id : une commande
 * déjà modifiée entre-temps (concurrence, rôle) échoue individuellement sans
 * bloquer les autres.
 */
export async function bulkCancelOrdersAction(
  ids: string[]
): Promise<BulkCancelResult> {
  const session = await requireCashier();
  const role = session.user.role as UserRole;

  const failed: { id: string; error: string }[] = [];
  let cancelled = 0;
  for (const id of ids) {
    try {
      await setOrderStatus(id, 'CANCELLED', role);
      cancelled++;
    } catch (err) {
      failed.push({ id, error: formatMutationError(err) });
    }
  }
  revalidatePath('/dashboard/commandes');
  revalidatePath('/dashboard/ardoise');
  return { cancelled, failed };
}

/**
 * Encaisse une commande (marque payée) depuis la section Commandes. `payments`
 * (1..N lignes `{mode, amount}`) doit sommer exactement au total de la
 * commande — paiement fractionné supporté.
 */
export async function markOrderPaidAction(
  id: string,
  payments: OrderPaymentLineInput[],
  opts?: { coverShortage?: boolean }
): Promise<MutationFailure | undefined> {
  const session = await requireCashier();

  try {
    await setOrderPayment(id, true, payments, session.user.id, {
      coverShortage: opts?.coverShortage,
    });
  } catch (err) {
    return toFailure(id, err);
  }
  revalidateOrder(id);
}

/**
 * Enregistre un versement d'acompte (commande spéciale à l'avance, cf.
 * `Order.depositRequired`). Distinct de `markOrderPaidAction` : ne solde
 * jamais la commande, ne déclenche jamais l'entrée en cuisine.
 */
export async function recordDepositAction(
  id: string,
  payments: OrderPaymentLineInput[]
): Promise<MutationFailure | undefined> {
  const session = await requireCashier();

  try {
    await recordDeposit(id, payments, session.user.id);
  } catch (err) {
    return toFailure(id, err);
  }
  revalidateOrder(id);
}

/**
 * Action express : marque la commande payée (si besoin) ET récupérée en un
 * clic. `payments` est ignoré si la commande est déjà payée.
 */
export async function payAndCompleteAction(
  id: string,
  payments: OrderPaymentLineInput[] | undefined,
  opts?: { coverShortage?: boolean }
): Promise<MutationFailure | undefined> {
  const session = await requireCashier();
  const role = session.user.role as UserRole;

  try {
    await payAndComplete(id, payments, role, session.user.id, {
      coverShortage: opts?.coverShortage,
    });
  } catch (err) {
    return toFailure(id, err);
  }
  revalidateOrder(id);
}

/**
 * `restoreRemovedStock` : un article retiré d'une commande déjà partie en
 * cuisine revient au stock par défaut (il n'a pas été consommé). Passer `false`
 * quand le staff indique qu'il était déjà préparé.
 *
 * `coverShortage` : même geste que sur les autres mutations de stock — le
 * staff a confirmé avoir produit la quantité manquante pour l'ajout en cours.
 */
export async function updateOrderItemsAction(
  id: string,
  items: CartItem[],
  opts?: { restoreRemovedStock?: boolean; coverShortage?: boolean }
): Promise<MutationFailure | undefined> {
  // La cuisine peut désormais modifier les articles d'une commande en cours
  // (bouton dans /dashboard/preparation) — `requireKitchen()` couvre caisse
  // + cuisine (+ rôles supérieurs), même garde que le reste de l'écran cuisine.
  const session = await requireKitchen();

  try {
    await updateOrderItems(id, items, {
      restoreRemovedStock: opts?.restoreRemovedStock,
      coverShortage: opts?.coverShortage,
      actorId: session.user.id,
    });
  } catch (err) {
    return toFailure(id, err);
  }
  revalidateOrder(id);
}

/**
 * Édite les métadonnées d'une commande (moyen de paiement, type de commande,
 * créneau de retrait, note). RÉSERVÉ À L'ADMIN : `requireAdmin` rejette CASHIER
 * et KITCHEN même s'ils ont accès au reste du dashboard.
 */
export async function updateOrderDetailsAction(
  id: string,
  input: UpdateOrderDetailsInput
): Promise<{ error: string } | undefined> {
  await requireAdmin();

  try {
    await updateOrderDetails(id, input);
  } catch (err) {
    return { error: formatMutationError(err) };
  }
  revalidateOrder(id);
}

/**
 * Associe (ou détache) un client à une commande depuis la page de détail.
 * Revalide aussi la fiche client concernée (ses stats / commandes changent).
 */
export async function setOrderCustomerAction(
  id: string,
  input: SetOrderCustomerInput
): Promise<{ error: string } | undefined> {
  const session = await requireCashier();

  let customerId: string | null;
  try {
    ({ customerId } = await setOrderCustomer(id, input, session.user.id));
  } catch (err) {
    return { error: formatMutationError(err) };
  }
  revalidateOrder(id);
  if (customerId) {
    revalidatePath(`/dashboard/clients/${customerId}`);
    revalidatePath('/dashboard/clients');
  }
}
