// Réservations de stock par ressource — réservation pour les programmées du jour.
//
// Une programmée PAYÉE dont le retrait tombe AUJOURD'HUI, pas encore lancée, prend
// sa part du stock dès qu'il est disponible, ressource par ressource (le chocolat
// d'abord, la vanille quand elle arrive). Le comptoir ne peut plus vendre cette
// part ; la commande, elle, n'entre PAS en cuisine (pas de notification « en
// préparation »). Le lancement (`reserveStockOnce`) ne décompte ensuite que le reste.
//
// Priorité : heure de retrait, puis création. Un verrou de ligne par commande
// sérialise deux passages concurrents (réappro + paiement).

import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { endOfLocalDay, startOfLocalDay } from '@/lib/timezone';
import type { CartItem } from '@/lib/cart-store';
import { aggregateStockNeeds } from '@/lib/orders/mutations/stock-needs';
import {
  ACTIVE_REFUND_STATUSES,
  loadHolds,
  readStockByKeys,
  releaseStaleHolds,
} from './holds';
import { logStockChange } from '@/lib/stock-history/record';
import { computeHolds, needsToMap, parseHoldKey, type HoldMap } from './keys';

const BATCH_SIZE = 50;

export type ReserveResult = { orders: number; units: number };

async function takeFromStock(
  tx: Prisma.TransactionClient,
  key: string,
  quantity: number,
  orderId: string
): Promise<boolean> {
  const { kind, id } = parseHoldKey(key);
  // Gardé par le stock : une vente concurrente qui a déjà pris l'unité fait échouer la réservation.
  const res =
    kind === 'PRODUCT'
      ? await tx.product.updateMany({
          where: { id, stockQuantity: { gte: quantity } },
          data: { stockQuantity: { decrement: quantity } },
        })
      : await tx.supplementOption.updateMany({
          where: { id, stockQuantity: { gte: quantity } },
          data: { stockQuantity: { decrement: quantity } },
        });
  if (res.count !== 1) return false;
  await logStockChange(tx, {
    kind,
    resourceId: id,
    reason: 'HOLD_RESERVE',
    delta: -quantity,
    ctx: { orderId, source: 'SYSTEM' },
  });
  return true;
}

async function reserveOne(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<number> {
  await tx.$queryRaw`SELECT id FROM "order" WHERE id = ${orderId} FOR UPDATE`;

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { status: true, isPaid: true, stockReservedAt: true, items: true },
  });
  if (
    !order ||
    order.status !== 'NEW' ||
    !order.isPaid ||
    order.stockReservedAt !== null
  ) {
    return 0;
  }

  const needs = needsToMap(
    await aggregateStockNeeds(tx, order.items as unknown as CartItem[])
  );
  const held = await loadHolds(tx, orderId);
  const stock = await readStockByKeys(tx, [...needs.keys()]);
  const toHold: HoldMap = computeHolds(needs, held, stock);

  let units = 0;
  for (const [key, quantity] of toHold) {
    if (!(await takeFromStock(tx, key, quantity, orderId))) continue;
    const { kind, id } = parseHoldKey(key);
    await tx.orderStockHold.upsert({
      where: {
        orderId_kind_resourceId: { orderId, kind, resourceId: id },
      },
      create: { orderId, kind, resourceId: id, quantity },
      update: { quantity: { increment: quantity } },
    });
    units += quantity;
  }
  return units;
}

/**
 * Réserve le stock disponible pour les programmées payées du jour. Sans option :
 * toutes les candidates (appelé après un réappro) ; `orderId` : une seule (après
 * paiement, édition). Idempotent ; ne lève que sur panne de base.
 */
export async function reserveForScheduledOrders(opts?: {
  orderId?: string;
  now?: Date;
}): Promise<ReserveResult> {
  const now = opts?.now ?? new Date();
  const result: ReserveResult = { orders: 0, units: 0 };

  // Rend d'abord ce que les commandes sorties du dispositif retiennent encore.
  const released = await prisma.$transaction((tx) =>
    releaseStaleHolds(tx, now)
  );

  // staff-visibility: exempt — passage système : il réserve du stock pour les programmées payées du jour
  const candidates = await prisma.order.findMany({
    where: {
      ...(opts?.orderId ? { id: opts.orderId } : {}),
      status: 'NEW',
      isPaid: true,
      stockReservedAt: null,
      pickupTime: { gte: startOfLocalDay(now), lte: endOfLocalDay(now) },
      refunds: { none: { status: { in: [...ACTIVE_REFUND_STATUSES] } } },
    },
    select: { id: true },
    orderBy: [{ pickupTime: 'asc' }, { createdAt: 'asc' }],
    take: BATCH_SIZE,
  });

  for (const { id } of candidates) {
    const units = await prisma.$transaction((tx) => reserveOne(tx, id));
    if (units > 0) {
      result.orders++;
      result.units += units;
    }
  }

  // Un changement de stock ne touche pas la table `order` : le trigger Postgres ne sonne pas.
  if (result.units > 0 || released > 0) {
    await prisma.$executeRaw`SELECT pg_notify('orders_changed', '')`;
  }
  return result;
}

/** Variante « ne jamais faire échouer l'appelant » (réappro, paiement, édition). */
export async function reserveForScheduledOrdersSafe(opts?: {
  orderId?: string;
}): Promise<void> {
  try {
    await reserveForScheduledOrders(opts);
  } catch (err) {
    console.error('[stock-holds] réservation échouée :', err);
  }
}
