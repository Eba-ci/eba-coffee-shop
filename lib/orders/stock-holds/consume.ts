// Réservations de stock par ressource — consommation au lancement en cuisine.

import type { Prisma } from '@/generated/prisma/client';
import type { CartItem } from '@/lib/cart-store';
import { StockShortageError } from '@/lib/orders/mutations/errors';
import { aggregateStockNeeds } from '@/lib/orders/mutations/stock-needs';
import { logStockChange } from '@/lib/stock-history/record';
import type { StockLogCtx } from '@/lib/stock-history/types';
import { holdKey, type HoldMap } from './keys';

/**
 * Décompte uniquement `besoin − déjà réservé` pour chaque ressource, puis supprime
 * les réservations : appelé par `reserveStockOnce` quand la commande en porte.
 * Un excédent (réservé > besoin) est rendu au stock. Même garde de stock que
 * `decrementStockForOrderItems`.
 */
export async function decrementResidualNeeds(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: CartItem[],
  held: HoldMap,
  ctx?: StockLogCtx
): Promise<void> {
  const log = { ...ctx, orderId };
  const { products, options, unresolved } = await aggregateStockNeeds(
    tx,
    items
  );

  for (const [id, need] of products) {
    const residual = need.needed - (held.get(holdKey('PRODUCT', id)) ?? 0);
    if (residual <= 0) continue;
    const res = await tx.product.updateMany({
      where: {
        id,
        OR: [{ stockQuantity: null }, { stockQuantity: { gte: residual } }],
      },
      data: { stockQuantity: { decrement: residual } },
    });
    if (res.count !== 1) {
      throw new StockShortageError(`Stock insuffisant pour « ${need.name} »`);
    }
    await logStockChange(tx, {
      kind: 'PRODUCT',
      resourceId: id,
      reason: 'ORDER_KITCHEN',
      delta: -residual,
      ctx: log,
    });
  }

  for (const [id, need] of options) {
    const residual = need.needed - (held.get(holdKey('OPTION', id)) ?? 0);
    if (residual <= 0) continue;
    const res = await tx.supplementOption.updateMany({
      where: {
        id,
        OR: [{ stockQuantity: null }, { stockQuantity: { gte: residual } }],
      },
      data: { stockQuantity: { decrement: residual } },
    });
    if (res.count !== 1) {
      throw new StockShortageError(
        `Stock insuffisant pour « ${need.productName} — ${need.optionName} »`
      );
    }
    await logStockChange(tx, {
      kind: 'OPTION',
      resourceId: id,
      reason: 'ORDER_KITCHEN',
      delta: -residual,
      ctx: log,
    });
  }

  for (const need of unresolved.values()) {
    throw new StockShortageError(
      `Option indisponible pour « ${need.productName} — ${need.optionName} »`
    );
  }

  // Surplus de réservation (ne devrait pas arriver : une édition libère tout d'abord).
  for (const [key, quantity] of held) {
    const [kind, id] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
    const needed =
      kind === 'PRODUCT'
        ? (products.get(id)?.needed ?? 0)
        : (options.get(id)?.needed ?? 0);
    const surplus = quantity - needed;
    if (surplus <= 0) continue;
    if (kind === 'PRODUCT') {
      await tx.product.updateMany({
        where: { id },
        data: { stockQuantity: { increment: surplus } },
      });
    } else {
      await tx.supplementOption.updateMany({
        where: { id },
        data: { stockQuantity: { increment: surplus } },
      });
    }
    await logStockChange(tx, {
      kind: kind === 'PRODUCT' ? 'PRODUCT' : 'OPTION',
      resourceId: id,
      reason: 'HOLD_RELEASE',
      delta: surplus,
      ctx: { ...log, note: 'Surplus de réservation rendu au lancement' },
    });
  }

  await tx.orderStockHold.deleteMany({ where: { orderId } });
}
