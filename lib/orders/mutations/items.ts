// Mutations de commandes — items.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { computeItemsTotal, getMaxItemDiscount } from '@/lib/orders/totals';
import type { CartItem } from '@/lib/cart-store';
import { OrderMutationError } from './errors';
import { releaseOrderCredit } from './credit';
import {
  releaseHolds,
  reserveForScheduledOrdersSafe,
} from '@/lib/orders/stock-holds';
import { resyncStockForItemChange } from './stock-resync';

/** Remplace les articles d'une commande et recalcule son total (net après remises). */
export async function updateOrderItems(
  id: string,
  items: CartItem[],
  opts?: {
    restoreRemovedStock?: boolean;
    coverShortage?: boolean;
    actorId?: string | null;
  }
): Promise<{ total: number }> {
  if (items.length === 0) {
    throw new OrderMutationError(
      'La commande doit avoir au moins un article',
      400
    );
  }

  // Plafond de remise par ligne (sécurité serveur, en plus de la validation UI).
  for (const item of items) {
    if ((item.discount ?? 0) > getMaxItemDiscount(item)) {
      throw new OrderMutationError(
        `Remise trop élevée sur « ${item.productName} »`,
        400
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id },
      select: {
        status: true,
        loyaltyDiscount: true,
        items: true,
        stockReservedAt: true,
        isPaid: true,
        creditApplied: true,
      },
    });
    if (!order) {
      throw new OrderMutationError('Commande introuvable', 404);
    }
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new OrderMutationError(
        'Impossible de modifier une commande terminée ou annulée',
        409
      );
    }

    // Pas encore lancée : ses parts réservées reposent sur l'ancien contenu. On les
    // rend ; le passage ci-dessous les reprend sur le nouveau.
    if (order.stockReservedAt === null) {
      await releaseHolds(tx, id, {
        actorId: opts?.actorId,
        note: 'Commande modifiée : réservations recalculées',
      });
    }

    if (order.stockReservedAt !== null) {
      await resyncStockForItemChange(
        tx,
        order.items as unknown as CartItem[],
        items,
        opts?.restoreRemovedStock ?? true,
        opts?.coverShortage ?? false,
        { orderId: id, actorId: opts?.actorId }
      );
    }

    const total = Math.max(
      0,
      computeItemsTotal(items) - (order.loyaltyDiscount ?? 0)
    );

    // Avoir retenu pour un paiement en ligne : le total change, la part retenue
    // n'a plus de sens (montant Jèko négatif). Rendu ; le client le réapplique au
    // prochain paiement.
    if (!order.isPaid && order.creditApplied > 0) {
      await releaseOrderCredit(tx, id);
    }

    await tx.order.update({
      where: { id },
      data: { items: items as unknown as Prisma.InputJsonValue, total },
    });

    return { total };
  });
  await reserveForScheduledOrdersSafe({ orderId: id });
  return result;
}
