import prisma from '@/lib/prisma';
import type { CartItem } from '@/lib/cart-store';
import { withStaffVisible } from '@/lib/orders/visibility';
import { fetchStockSnapshot } from '@/lib/orders/availability';
import { fullyRefundedOrderIds } from '@/lib/refunds/fully-refunded';
import { coalesceAsyncByKey } from '@/lib/async-coalesce';
import { getOrdersGeneration } from '@/lib/postgres-notify';
import {
  isHoldCandidate,
  summarizeStockHolds,
  toSummary,
} from '@/lib/orders/stock-holds';
import {
  describeAvailability,
  describeShortage,
  needsAvailability,
} from './availability';
import { loadQueueLoyalty } from './loyalty';
import { buildQueueWhere } from './where';
import type { CashierOrder } from './types';

async function findQueueOrders(now: Date) {
  const orders = await prisma.order.findMany({
    // Toutes les commandes ouvertes, tous jours confondus (cf. `./where`).
    where: withStaffVisible(buildQueueWhere(now)),
    include: { customer: { select: { isTrusted: true } } },
    // FIFO strict : la commande la plus ancienne en haut.
    orderBy: { createdAt: 'asc' },
  });

  // Remboursée en totalité et non récupérée : plus rien à encaisser ni à servir.
  const gone = await fullyRefundedOrderIds(
    orders.filter((o) => o.isPaid || o.depositPaid).map((o) => o.id)
  );
  return gone.size ? orders.filter((o) => !gone.has(o.id)) : orders;
}

export async function fetchCashierQueue(): Promise<CashierOrder[]> {
  const now = new Date();
  const orders = await findQueueOrders(now);

  // Un seul instantané de stock pour toutes les commandes concernées (pas de N+1).
  const stock = await fetchStockSnapshot(
    orders
      .filter((o) => needsAvailability(o, now))
      .map((o) => o.items as CartItem[])
  );
  const {
    loyaltySettings,
    stampCountByCustomerId,
    stampEarnedOrderIds,
    totalStampEntriesByCustomerId,
  } = await loadQueueLoyalty(orders);

  // Programmées payées du jour : le stock déjà réservé pour elles est sorti du stock
  // courant, il faut le recompter sinon elles s'afficheraient « indisponibles ».
  const holdDetails = await summarizeStockHolds(
    orders
      .filter((o) => isHoldCandidate(o, now))
      .map((o) => ({ id: o.id, items: o.items as CartItem[] }))
  );

  return orders.map((o) => {
    const items = o.items as CartItem[];

    const hold = holdDetails.get(o.id);
    const { stockShortage, unavailableItemNames } = hold
      ? describeAvailability(items, hold.availability)
      : needsAvailability(o, now)
        ? describeShortage(items, stock)
        : { stockShortage: false, unavailableItemNames: [] };

    const loyaltyStampCount = o.customerId
      ? (stampCountByCustomerId.get(o.customerId) ?? null)
      : null;
    const loyaltyPickupOutcome =
      o.status === 'READY' && o.customerId
        ? {
            stampEarned: stampEarnedOrderIds.has(o.id),
            isFirstStampEver:
              stampEarnedOrderIds.has(o.id) &&
              totalStampEntriesByCustomerId.get(o.customerId) === 1,
          }
        : null;

    return {
      id: o.id,
      reference: o.reference,
      dailyNumber: o.dailyNumber,
      customerId: o.customerId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      pickupTime: o.pickupTime,
      orderType: o.orderType,
      items,
      note: o.note,
      total: o.total,
      depositRequired: o.depositRequired,
      depositPaid: o.depositPaid,
      loyaltyDiscount: o.loyaltyDiscount,
      loyaltyRewardId: o.loyaltyRewardId,
      creditApplied: o.creditApplied,
      status: o.status,
      isPaid: o.isPaid,
      isOnAccount: o.isOnAccount,
      customerTrusted: o.customer?.isTrusted ?? false,
      paymentMode: o.paymentMode,
      paymentAutoValidatedByAi: o.paymentAutoValidatedByAi,
      paymentProofUrl: o.paymentProofUrl,
      paymentProofVerdict: o.paymentProofVerdict,
      paymentProofAnalysis: o.paymentProofAnalysis,
      source: o.source,
      driverRequested: o.driverRequested,
      driverRequestedAt: o.driverRequestedAt,
      driverName: o.driverName,
      driverPhone: o.driverPhone,
      createdAt: o.createdAt,
      preparingStartedAt: o.preparingStartedAt,
      readyAt: o.readyAt,
      stockReservedAt: o.stockReservedAt,
      stockShortage,
      unavailableItemNames,
      ...(hold ? { stockHold: toSummary(hold) } : {}),
      loyaltySettings,
      loyaltyStampCount,
      loyaltyPickupOutcome,
    };
  });
}

/**
 * Variante mutualisée pour le flux SSE : les appels déclenchés par le MÊME
 * NOTIFY Postgres partagent une exécution, mais un client réagissant à une
 * notification plus récente obtient un calcul frais (cf. `lib/async-coalesce.ts`).
 */
export const fetchCashierQueueShared = coalesceAsyncByKey(
  fetchCashierQueue,
  getOrdersGeneration
);
