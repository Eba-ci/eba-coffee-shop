// Réservations de stock par ressource — lecture, restitution, nettoyage.

import type { Prisma } from '@/generated/prisma/client';
import { endOfLocalDay, startOfLocalDay } from '@/lib/timezone';
import { logStockChange } from '@/lib/stock-history/record';
import type { StockLogCtx } from '@/lib/stock-history/types';
import { holdKey, parseHoldKey, type HoldMap } from './keys';

export const ACTIVE_REFUND_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'UNCERTAIN',
  'PAID',
] as const;

/** Stock courant des ressources désignées (`null` = illimité ; clé absente = disparue). */
export async function readStockByKeys(
  tx: Prisma.TransactionClient,
  keys: string[]
): Promise<Map<string, number | null>> {
  const productIds: string[] = [];
  const optionIds: string[] = [];
  for (const key of keys) {
    const { kind, id } = parseHoldKey(key);
    (kind === 'PRODUCT' ? productIds : optionIds).push(id);
  }
  const stock = new Map<string, number | null>();
  if (productIds.length > 0) {
    const rows = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stockQuantity: true },
    });
    for (const r of rows) stock.set(`PRODUCT:${r.id}`, r.stockQuantity);
  }
  if (optionIds.length > 0) {
    const rows = await tx.supplementOption.findMany({
      where: { id: { in: optionIds } },
      select: { id: true, stockQuantity: true },
    });
    for (const r of rows) stock.set(`OPTION:${r.id}`, r.stockQuantity);
  }
  return stock;
}

/** Parts déjà réservées pour une commande, par clé de ressource. */
export async function loadHolds(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<HoldMap> {
  const rows = await tx.orderStockHold.findMany({
    where: { orderId },
    select: { kind: true, resourceId: true, quantity: true },
  });
  const map: HoldMap = new Map();
  for (const r of rows) map.set(holdKey(r.kind, r.resourceId), r.quantity);
  return map;
}

/** Réservations de plusieurs commandes d'un coup (écrans cuisine/caisse). */
export async function loadHoldsForOrders(
  tx: Prisma.TransactionClient,
  orderIds: string[]
): Promise<Map<string, HoldMap>> {
  const out = new Map<string, HoldMap>();
  if (orderIds.length === 0) return out;
  const rows = await tx.orderStockHold.findMany({
    where: { orderId: { in: orderIds } },
    select: { orderId: true, kind: true, resourceId: true, quantity: true },
  });
  for (const r of rows) {
    const map = out.get(r.orderId) ?? new Map<string, number>();
    map.set(holdKey(r.kind, r.resourceId), r.quantity);
    out.set(r.orderId, map);
  }
  return out;
}

/**
 * Restitue au stock les parts réservées d'une commande puis les supprime.
 * `NULL + n = NULL` : une cible passée à stock illimité le reste. Retourne le
 * nombre d'unités rendues (0 = rien n'était réservé).
 */
export async function releaseHolds(
  tx: Prisma.TransactionClient,
  orderId: string,
  ctx?: StockLogCtx
): Promise<number> {
  const held = await loadHolds(tx, orderId);
  if (held.size === 0) return 0;
  let units = 0;
  for (const [key, quantity] of held) {
    const { kind, id } = parseHoldKey(key);
    if (kind === 'PRODUCT') {
      await tx.product.updateMany({
        where: { id },
        data: { stockQuantity: { increment: quantity } },
      });
    } else {
      await tx.supplementOption.updateMany({
        where: { id },
        data: { stockQuantity: { increment: quantity } },
      });
    }
    await logStockChange(tx, {
      kind,
      resourceId: id,
      reason: 'HOLD_RELEASE',
      delta: quantity,
      ctx: { ...ctx, orderId },
    });
    units += quantity;
  }
  await tx.orderStockHold.deleteMany({ where: { orderId } });
  return units;
}

/**
 * Libère les réservations des commandes sorties du dispositif (annulée, dépayée,
 * remboursée, jour passé, lancée…) qu'aucun chemin direct n'aurait rendues.
 * Une commande DÉJÀ lancée (`stockReservedAt`) a décompté tout son besoin : ses
 * lignes sont de simples résidus, supprimées SANS recrédit.
 */
export async function releaseStaleHolds(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<number> {
  const stale = await tx.orderStockHold.findMany({
    where: {
      order: {
        OR: [
          { status: { not: 'NEW' } },
          { isPaid: false },
          { stockReservedAt: { not: null } },
          { pickupTime: null },
          { pickupTime: { lt: startOfLocalDay(now) } },
          { pickupTime: { gt: endOfLocalDay(now) } },
          {
            refunds: { some: { status: { in: [...ACTIVE_REFUND_STATUSES] } } },
          },
        ],
      },
    },
    select: { orderId: true },
    distinct: ['orderId'],
  });
  let units = 0;
  for (const { orderId } of stale) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { stockReservedAt: true },
    });
    if (order?.stockReservedAt) {
      await tx.orderStockHold.deleteMany({ where: { orderId } });
    } else {
      units += await releaseHolds(tx, orderId, {
        source: 'SYSTEM',
        note: 'Réservation orpheline rendue',
      });
    }
  }
  return units;
}
