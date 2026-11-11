import prisma from '@/lib/prisma';
import { withStaffVisible } from '@/lib/orders/visibility';
import type { CartItemInput } from '@/lib/schemas/order';
import { getSupplementsPrice } from '@/lib/supplements';

export type MarginAggregate = {
  /** CA des lignes (coût connu ou non), remises déduites. */
  revenue: number;
  /** CA des seules lignes dont le coût figé est connu. */
  revenueWithCost: number;
  /** Coût figé (matière + emballage) de ces lignes. */
  cost: number;
};

/**
 * Agrégat CA / coût figé sur une plage, même règle que `getProductStats` :
 * `coutMatiere + coutEmballage` × quantité, commandes annulées exclues. Une
 * ligne sans coût compte dans `revenue` mais pas dans `revenueWithCost`.
 */
export async function getMarginAggregate(
  from: Date,
  to: Date
): Promise<MarginAggregate> {
  const rows = await prisma.order.findMany({
    where: withStaffVisible({
      dailyDate: { gte: from, lte: to },
      status: { not: 'CANCELLED' },
    }),
    select: { items: true },
  });
  const agg: MarginAggregate = { revenue: 0, revenueWithCost: 0, cost: 0 };
  for (const row of rows) {
    for (const item of (row.items as unknown as CartItemInput[]) ?? []) {
      const gross =
        (item.basePrice + getSupplementsPrice(item.supplements)) *
        item.quantity;
      const lineRevenue = gross - (item.discount ?? 0);
      const lineCost =
        ((item.coutMatiere ?? 0) + (item.coutEmballage ?? 0)) * item.quantity;
      agg.revenue += lineRevenue;
      if (lineCost > 0) {
        agg.revenueWithCost += lineRevenue;
        agg.cost += lineCost;
      }
    }
  }
  return agg;
}
