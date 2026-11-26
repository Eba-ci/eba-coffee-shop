// lib/preparation-queue.ts
//
// Requête partagée entre :
// - le server action `getPreparationQueue` (chargement SSR initial de /dashboard/preparation)
// - la route SSE `app/api/preparation/stream/route.ts` (re-fetch déclenché par LISTEN/NOTIFY)
//
// Ce fichier n'est PAS marqué `'use server'` : il exporte une fonction et un type plain,
// importables aussi bien par un fichier server action que par un route handler.
// L'auth est de la responsabilité de l'appelant.

import prisma from '@/lib/prisma';
import { withStaffVisible } from '@/lib/orders/visibility';
import { compareKitchenFifo } from '@/lib/orders/queue-order';
import { buildPreparationWhere } from '@/lib/preparation-queue-where';
import { fullyRefundedOrderIds } from '@/lib/refunds/fully-refunded';
import { coalesceAsyncByKey } from '@/lib/async-coalesce';
import { getOrdersGeneration } from '@/lib/postgres-notify';
import {
  isHoldCandidate,
  summarizeStockHolds,
  toSummary,
  type StockHoldSummary,
} from '@/lib/orders/stock-holds';
import type { CartItem } from '@/lib/cart-store';
import type { OrderSource, OrderType } from '@/generated/prisma/client';

export type PreparationOrder = {
  id: string;
  reference: string;
  dailyNumber: number;
  customerName: string | null;
  customerPhone: string | null;
  // Id de la fiche CRM liée (null = commande anonyme) — distinct de
  // `customerName`/`customerPhone`, qui ne sont que des champs texte sur la
  // commande. Nécessaire pour `AssociateCustomer` (savoir si déjà lié).
  customerId: string | null;
  pickupTime: Date | null;
  orderType: OrderType;
  items: CartItem[];
  note: string | null;
  total: number;
  // Origine de création : distingue en-ligne / caisse / MCP, même badge
  // qu'en caisse (cf. `lib/cashier-queue.ts`).
  source: OrderSource;
  // La cuisine voit les commandes EN cours (PREPARING), celles prêtes en
  // attente de récupération (READY) — pour emballer et suivre les clients qui
  // tardent — ET, depuis les commandes différées, les NEW À CRÉNEAU pas encore
  // lancées : elles vivent dans « Programmées », alimentent « À produire », et
  // portent le bouton « Lancer la préparation ».
  //
  // Une NEW SANS créneau (walk-in en attente d'encaissement) n'entre jamais
  // ici : la cuisine ne doit pas produire ce qui n'est pas engagé.
  status: 'NEW' | 'PREPARING' | 'READY';
  isPaid: boolean;
  // Montant déjà versé au titre d'un acompte — nécessaire pour calculer le
  // solde restant à encaisser (`total - depositPaid`), même règle que
  // `lib/cashier-queue.ts` et `commandes/page.tsx`.
  depositPaid: number;
  driverRequested: boolean;
  driverName: string | null;
  driverPhone: string | null;
  createdAt: Date;
  // Amorces des minuteurs : entrée en cuisine et passage prête. Null pour les
  // commandes créées avant l'ajout des colonnes (repli createdAt côté UI).
  preparingStartedAt: Date | null;
  readyAt: Date | null;
  /** Instant de réservation du stock. `null` = reste à produire (alimente le
   * panneau « À produire », cf. lib/orders/production-plan.ts). */
  stockReservedAt: Date | null;
  /**
   * Programmée payée du jour pas encore lancée : ce qui est déjà réservé pour
   * elle (cf. lib/orders/stock-holds). Absent pour toute autre commande.
   */
  stockHold?: StockHoldSummary;
};

/**
 * Renvoie les commandes visibles en cuisine : en préparation
 * (status=PREPARING) et prêtes en attente de récupération (status=READY),
 * quel que soit leur jour de création ou de retrait (une commande ouverte ne
 * disparaît pas à minuit),
 * triées en FIFO par ENTRÉE EN CUISINE (`preparingStartedAt`, repli
 * `createdAt` — cf. `compareKitchenFifo`).
 *
 * Trier par `createdAt` seul serait faux : une commande créée à 10:00 mais
 * encaissée à 10:10 entre en cuisine APRÈS une commande créée à 10:05 et
 * encaissée à 10:06. Prisma ne sait pas exprimer un `COALESCE` dans `orderBy`,
 * donc le `orderBy` SQL ne sert que d'entrée stable et le tri final se fait en
 * mémoire.
 *
 * Une commande arrive en cuisine soit :
 *   - automatiquement quand le caissier la marque payée (NEW → PREPARING)
 *   - explicitement quand le caissier clique "Envoyer en cuisine sans paiement"
 *
 * Une commande NEW n'est visible que si elle porte un CRÉNEAU et n'a pas encore
 * réservé son stock : c'est une commande programmée en attente de lancement.
 * Un walk-in NEW (sans créneau, en attente d'encaissement) reste invisible ici.
 * Les READY restent affichées (section « en attente de récupération ») jusqu'à
 * leur passage COMPLETED (récupérée) côté caisse.
 */
export async function fetchPreparationQueue(): Promise<PreparationOrder[]> {
  const now = new Date();

  // Toutes les commandes ouvertes, tous jours confondus (cf. `buildPreparationWhere`).
  const orders = await prisma.order.findMany({
    where: withStaffVisible(buildPreparationWhere()),
    orderBy: { createdAt: 'asc' },
  });

  // Remboursée en totalité et non récupérée : rien à produire, rien à emballer.
  const gone = await fullyRefundedOrderIds(
    orders.filter((o) => o.isPaid || o.depositPaid).map((o) => o.id)
  );

  const visible = orders.filter((o) => !gone.has(o.id));
  const holdDetails = await summarizeStockHolds(
    visible
      .filter((o) => isHoldCandidate(o, now))
      .map((o) => ({ id: o.id, items: o.items as CartItem[] }))
  );

  const mapped = visible.map((o) => ({
    id: o.id,
    reference: o.reference,
    dailyNumber: o.dailyNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerId: o.customerId,
    pickupTime: o.pickupTime,
    orderType: o.orderType,
    items: o.items as CartItem[],
    note: o.note,
    total: o.total,
    source: o.source,
    status: o.status as 'NEW' | 'PREPARING' | 'READY',
    isPaid: o.isPaid,
    depositPaid: o.depositPaid ?? 0,
    driverRequested: o.driverRequested,
    driverName: o.driverName,
    driverPhone: o.driverPhone,
    createdAt: o.createdAt,
    preparingStartedAt: o.preparingStartedAt,
    readyAt: o.readyAt,
    stockReservedAt: o.stockReservedAt,
    ...(holdDetails.has(o.id)
      ? { stockHold: toSummary(holdDetails.get(o.id)!) }
      : {}),
  }));

  return mapped.sort(compareKitchenFifo);
}

/**
 * Variante mutualisée de `fetchPreparationQueue()`, à utiliser par le flux SSE
 * (`/api/preparation/stream`). Même situation qu'en caisse : chaque écran
 * cuisine connecté possède sa PROPRE boucle debounce/notify mais reçoit le même
 * instantané global, si bien qu'une seule mutation de commande relançait la
 * requête une fois PAR écran connecté.
 *
 * Mutualisation kéyée sur la génération de notification, et NON sur la simple
 * présence d'un calcul en vol : un écran réveillé par une notification plus
 * récente doit obtenir un calcul frais, sinon la commande qui l'a réveillé
 * resterait invisible en cuisine. Voir la démonstration détaillée en tête de
 * `lib/async-coalesce.ts`. Pas de TTL.
 */
export const fetchPreparationQueueShared = coalesceAsyncByKey(
  fetchPreparationQueue,
  getOrdersGeneration
);
