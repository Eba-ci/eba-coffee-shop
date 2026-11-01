'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireKitchen } from '@/lib/auth-helpers';
import {
  fetchPreparationQueue,
  type PreparationOrder,
} from '@/lib/preparation-queue';
import { canRequestDriver } from '@/lib/order-permissions';
import {
  setOrderStatus,
  setOrderPayment,
  setOrderCustomer,
  getOrderShortage,
  StockShortageError,
} from '@/lib/order-mutations';
import type { ShortageLine } from '@/lib/orders/shortage';
import type {
  OrderPaymentLineInput,
  SetOrderCustomerInput,
} from '@/lib/schemas/order';
import type { UserRole } from '@/generated/prisma/client';

export async function getPreparationQueue(): Promise<PreparationOrder[]> {
  await requireKitchen();
  return fetchPreparationQueue();
}

/**
 * Lance une commande programmée en cuisine (`NEW → PREPARING`), ce qui réserve
 * son stock. C'est LE geste du jour J : une commande différée n'entre jamais en
 * cuisine toute seule, précisément pour qu'un éventuel échec de stock se
 * produise devant quelqu'un.
 *
 * En cas de pénurie, on ne renvoie pas le cuisinier corriger le stock dans le
 * menu : la réponse porte la liste CHIFFRÉE des manques, l'écran demande « vous
 * les avez produits ? », et un second appel avec `coverShortage` enregistre la
 * production puis lance (effet net nul sur le stock).
 *
 * `canTransition('NEW', 'PREPARING', KITCHEN)` passe déjà — cf.
 * lib/order-permissions.ts.
 */
export async function startPreparation(
  id: string,
  opts?: { coverShortage?: boolean }
): Promise<{ error: string; shortage?: ShortageLine[] } | undefined> {
  const session = await requireKitchen();

  try {
    await setOrderStatus(id, 'PREPARING', session.user.role as UserRole, {
      coverShortage: opts?.coverShortage,
      actorId: session.user.id,
    });
  } catch (err) {
    // Jamais un `console.error` muet : le cuisinier doit voir POURQUOI son
    // geste n'a pas abouti.
    const error = err instanceof Error ? err.message : 'Erreur inattendue';
    if (err instanceof StockShortageError) {
      return { error, shortage: await getOrderShortage(id) };
    }
    return { error };
  }

  revalidatePath('/dashboard/preparation');
  revalidatePath('/dashboard/caisse');
  revalidatePath('/dashboard/commandes');
}

/**
 * Délègue à `setOrderStatus` plutôt que d'écrire directement : un `updateMany`
 * brut sautait les notifications (push « Commande prête » vers la caisse ET
 * `notifyOrderCustomer(id, 'READY')` vers le client), qui ne partaient donc
 * jamais quand c'était la CUISINE qui validait — seul le carillon de la page
 * fonctionnait. `canTransition('PREPARING', 'READY', KITCHEN)` passe, et
 * `requireKitchen()` nous donne déjà le rôle.
 */
export async function markOrderReady(id: string): Promise<void> {
  const session = await requireKitchen();
  await setOrderStatus(id, 'READY', session.user.role as UserRole);

  revalidatePath('/dashboard/preparation');
  revalidatePath('/dashboard/caisse');
  revalidatePath('/dashboard/commandes');
}

/**
 * Marquer une commande prête comme récupérée par le client (READY →
 * COMPLETED), même principe qu'en caisse. Délègue à `setOrderStatus` comme
 * `markOrderReady`, pour les mêmes raisons (notifications/push).
 */
export async function markOrderRetrieved(id: string): Promise<void> {
  const session = await requireKitchen();
  await setOrderStatus(id, 'COMPLETED', session.user.role as UserRole);

  revalidatePath('/dashboard/preparation');
  revalidatePath('/dashboard/caisse');
  revalidatePath('/dashboard/commandes');
}

/**
 * Défait une récupération (COMPLETED → statut précédent, READY ou
 * PREPARING selon d'où venait le geste — cf. `markOrderRetrieved` qui accepte
 * les deux origines). Appelée par le toast « Annuler » de `useUndoToast`
 * (10 s), sur le même principe que la caisse (`order-card-actions.tsx`).
 */
export async function revertOrderRetrieved(
  id: string,
  to: 'READY' | 'PREPARING'
): Promise<void> {
  const session = await requireKitchen();
  await setOrderStatus(id, to, session.user.role as UserRole);

  revalidatePath('/dashboard/preparation');
  revalidatePath('/dashboard/caisse');
  revalidatePath('/dashboard/commandes');
}

/**
 * Délègue à `setOrderStatus`, comme `markOrderReady`/`markOrderRetrieved` :
 * `KITCHEN` est maintenant inclus dans les transitions `* → CANCELLED`
 * (lib/order-permissions.ts), y compris le remboursement d'une commande déjà
 * récupérée+payée. Fonctionne donc depuis NEW/PREPARING/READY/COMPLETED, avec
 * la révocation du tampon fidélité et la notification client que l'ancien
 * `updateMany` brut sautait.
 */
export async function cancelOrderFromKitchen(id: string): Promise<void> {
  const session = await requireKitchen();
  await setOrderStatus(id, 'CANCELLED', session.user.role as UserRole);

  revalidatePath('/dashboard/preparation');
  revalidatePath('/dashboard/caisse');
  revalidatePath('/dashboard/commandes');
}

/**
 * Encaissement direct depuis la cuisine : le cuisinier peut collecter
 * l'argent d'une commande « ardoise » sans repasser par la caisse. Délègue à
 * `setOrderPayment`, qui n'a pas de garde de rôle interne — `requireKitchen()`
 * est le seul filtre ici. Volontairement PAS de dépaiement (`isPaid: false`)
 * ni d'édition du mode de règlement depuis cet écran : ça reste caisse-only.
 */
export async function markOrderPaidFromKitchen(
  id: string,
  payments: OrderPaymentLineInput[],
  opts?: { coverShortage?: boolean }
): Promise<{ error: string; shortage?: ShortageLine[] } | undefined> {
  const session = await requireKitchen();

  try {
    await setOrderPayment(id, true, payments, session.user.id, {
      coverShortage: opts?.coverShortage,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erreur inattendue';
    if (err instanceof StockShortageError) {
      return { error, shortage: await getOrderShortage(id) };
    }
    return { error };
  }

  revalidatePath('/dashboard/preparation');
  revalidatePath('/dashboard/caisse');
  revalidatePath('/dashboard/commandes');
}

/**
 * Associe (ou détache) un client à une commande depuis la cuisine — même
 * logique que `setOrderCustomerAction` (commandes/actions.ts), mais la
 * cuisine n'a pas accès à `/dashboard/commandes` (cf. `requireOrdersView`,
 * lib/auth-helpers.ts) : ce chemin passe donc par `/dashboard/preparation`.
 * `setOrderCustomer` n'a pas de garde de rôle interne, `requireKitchen()` est
 * le seul filtre ici.
 */
export async function setOrderCustomerFromKitchen(
  id: string,
  input: SetOrderCustomerInput
): Promise<{ error: string } | undefined> {
  const session = await requireKitchen();

  let customerId: string | null;
  try {
    ({ customerId } = await setOrderCustomer(id, input, session.user.id));
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }

  revalidatePath('/dashboard/preparation');
  revalidatePath('/dashboard/caisse');
  revalidatePath('/dashboard/commandes');
  if (customerId) {
    revalidatePath(`/dashboard/clients/${customerId}`);
    revalidatePath('/dashboard/clients');
  }
}

export async function requestDriver(id: string): Promise<void> {
  const session = await requireKitchen();
  const role = session.user.role as UserRole;
  if (!canRequestDriver(role)) {
    throw new Error('Non autorisé');
  }

  const result = await prisma.order.updateMany({
    where: { id, driverRequested: false },
    data: { driverRequested: true, driverRequestedAt: new Date() },
  });

  if (result.count === 0) {
    throw new Error('Demande déjà envoyée ou commande introuvable');
  }

  revalidatePath('/dashboard/preparation');
  revalidatePath('/dashboard/caisse');
}
