// Mutations de commandes — shortage.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import type { ShortageLine } from '@/lib/orders/shortage';
import type { CartItem } from '@/lib/cart-store';
import { StockShortageError } from './errors';
import { loadHolds } from '@/lib/orders/stock-holds/holds';
import type { HoldMap } from '@/lib/orders/stock-holds/keys';
import { computeShortage } from './stock-needs';
import { logStockChange } from '@/lib/stock-history/record';
import type { StockLogCtx } from '@/lib/stock-history/types';

/** Pénurie d'une commande existante, en LECTURE SEULE. */
export async function getOrderShortage(id: string): Promise<ShortageLine[]> {
  const order = await prisma.order.findUnique({
    where: { id },
    select: { items: true, stockReservedAt: true },
  });
  // Stock déjà réservé : plus rien à produire pour cette commande.
  if (!order || order.stockReservedAt !== null) return [];
  const held = await loadHolds(prisma, id);
  return computeShortage(prisma, order.items as unknown as CartItem[], held);
}

export async function getItemsShortage(
  items: CartItem[]
): Promise<ShortageLine[]> {
  return computeShortage(prisma, items);
}

/** Corps de réponse d'un refus pour pénurie. */
export type ShortagePayload = { error: string; shortage: ShortageLine[] };

/** Construit la réponse 409 d'une pénurie : le message ET les lignes manquantes. */
export async function buildShortagePayload(
  id: string,
  err: StockShortageError
): Promise<ShortagePayload> {
  return { error: err.message, shortage: await getOrderShortage(id) };
}

export async function coverShortageForOrderItems(
  tx: Prisma.TransactionClient,
  items: CartItem[],
  held?: HoldMap,
  ctx?: StockLogCtx
): Promise<ShortageLine[]> {
  const shortage = await computeShortage(tx, items, held);
  for (const line of shortage) {
    if (line.target === 'product') {
      await tx.product.update({
        where: { id: line.targetId },
        data: { stockQuantity: { increment: line.missing } },
      });
      await logStockChange(tx, {
        kind: 'PRODUCT',
        resourceId: line.targetId,
        reason: 'SHORTAGE_COVER',
        delta: line.missing,
        ctx,
      });
    } else {
      await tx.supplementOption.update({
        where: { id: line.targetId },
        data: { stockQuantity: { increment: line.missing } },
      });
      await logStockChange(tx, {
        kind: 'OPTION',
        resourceId: line.targetId,
        reason: 'SHORTAGE_COVER',
        delta: line.missing,
        ctx,
      });
    }
  }
  return shortage;
}
