// Mutations de commandes — stock-reservation.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { fetchStockSnapshot, optionKey } from '@/lib/orders/availability';
import { isDeferredPickup } from '@/lib/orders/scheduling';
import type { CartItem } from '@/lib/cart-store';
import { notifyOrderCustomer } from '@/lib/push-notify';
import { decrementResidualNeeds } from '@/lib/orders/stock-holds/consume';
import { loadHolds } from '@/lib/orders/stock-holds/holds';
import { decrementStockForOrderItems } from './stock-needs';
import { resyncStockForItemChange } from './stock-resync';
import { coverShortageForOrderItems } from './shortage';

// Seul chemin autorisé à remettre `stockReservedAt` à null (commande jamais payée).
export function releaseUnpaidStockHold(
  tx: Prisma.TransactionClient,
  items: CartItem[],
  orderId?: string
): Promise<void> {
  return resyncStockForItemChange(tx, items, [], true, false, {
    orderId,
    source: 'SYSTEM',
    removeReason: 'EXPIRY_RELEASE',
  });
}

// Verrou `Order.stockReservedAt` : décrément au plus une fois par commande.
export async function reserveStockOnce(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: CartItem[],
  opts?: { coverShortage?: boolean; actorId?: string | null }
): Promise<boolean> {
  const ctx = { orderId, actorId: opts?.actorId ?? null };
  const claim = await tx.order.updateMany({
    where: { id: orderId, stockReservedAt: null },
    data: { stockReservedAt: new Date() },
  });
  if (claim.count === 0) return false;

  // AVANT le décrément, et seulement sur demande explicite : le staff a
  // confirmé avoir produit la quantité manquante.
  // Parts déjà réservées avant le lancement (programmée du jour, cf.
  // lib/orders/stock-holds) : seul le RESTE est décompté.
  const held = await loadHolds(tx, orderId);

  if (opts?.coverShortage) {
    await coverShortageForOrderItems(tx, items, held, ctx);
  }

  if (held.size > 0) {
    await decrementResidualNeeds(tx, orderId, items, held, ctx);
  } else {
    await decrementStockForOrderItems(tx, items, ctx);
  }
  return true;
}

export async function notifyPendingOrdersOfShortage(
  reservedOrderId: string,
  reservedItems: CartItem[]
): Promise<void> {
  const now = new Date();
  const snapshot = await fetchStockSnapshot([reservedItems]);

  const zeroedProductIds = new Set(
    [...snapshot.products.entries()]
      .filter(([, qty]) => qty === 0)
      .map(([id]) => id)
  );
  const zeroedOptionKeys = new Set(
    [...snapshot.options.entries()]
      .filter(([, qty]) => qty === 0)
      .map(([key]) => key)
  );
  if (zeroedProductIds.size === 0 && zeroedOptionKeys.size === 0) return;

  // staff-visibility: exempt — prévient aussi les clients en cours de paiement qu'un produit de leur commande vient de s'épuiser
  const candidates = await prisma.order.findMany({
    where: {
      id: { not: reservedOrderId },
      stockReservedAt: null,
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
    },
    select: { id: true, items: true, pickupTime: true },
    take: 200,
  });

  for (const candidate of candidates) {
    if (isDeferredPickup(candidate.pickupTime, now)) continue;
    const items = candidate.items as unknown as CartItem[];
    const affected = items.some((item) => {
      if (zeroedProductIds.has(item.productId)) return true;
      return item.supplements.some((s) =>
        zeroedOptionKeys.has(
          optionKey(item.productId, s.groupName, s.optionName)
        )
      );
    });
    if (affected) {
      notifyOrderCustomer(candidate.id, 'ITEM_UNAVAILABLE');
    }
  }
}
