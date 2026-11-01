// lib/stock-history/queries.ts
//
// Lectures du journal de stock : liste filtrée et paginée, résumé par motif,
// chronologie d'une ressource. Écritures : `record.ts` uniquement.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { trgmSearch } from '@/lib/search/trgm';
import { SEARCH_HITS_LIMIT } from '@/lib/search/hits';
import type { StockKind, StockReason, StockSource } from './types';

export type StockMovementFilters = {
  /** Plage sur la date du mouvement (inclusive / exclusive, instants). */
  from?: Date;
  toExclusive?: Date;
  kind?: StockKind;
  resourceId?: string;
  reasons?: StockReason[];
  source?: StockSource;
  orderId?: string;
  actorId?: string;
  /** Recherche par nom (pg_trgm), sur les libellés figés des mouvements. */
  search?: string;
  page?: number;
  pageSize?: number;
};

/** Ids de ressources dont un libellé correspond au terme (meilleurs d'abord). */
async function resourceIdsMatching(term: string): Promise<string[]> {
  const search = trgmSearch(term, [{ sql: Prisma.sql`m."label"` }]);
  if (!search) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT m."resourceId" AS id
    FROM stock_movement m WHERE ${search.where}
    GROUP BY m."resourceId"
    ORDER BY MAX(${search.score}) DESC, m."resourceId"
    LIMIT ${SEARCH_HITS_LIMIT}`;
  return rows.map((r) => r.id);
}

async function buildWhere(
  f: StockMovementFilters
): Promise<Prisma.StockMovementWhereInput | null> {
  let resourceIds: string[] | undefined;
  if (f.search?.trim()) {
    resourceIds = await resourceIdsMatching(f.search);
    if (resourceIds.length === 0) return null;
  }
  return {
    ...((f.from || f.toExclusive) && {
      createdAt: {
        ...(f.from && { gte: f.from }),
        ...(f.toExclusive && { lt: f.toExclusive }),
      },
    }),
    ...(f.kind && { kind: f.kind }),
    ...(f.resourceId && { resourceId: f.resourceId }),
    ...(resourceIds && !f.resourceId && { resourceId: { in: resourceIds } }),
    ...(f.reasons?.length && { reason: { in: f.reasons } }),
    ...(f.source && { source: f.source }),
    ...(f.orderId && { orderId: f.orderId }),
    ...(f.actorId && { actorId: f.actorId }),
  };
}

export type StockMovementRow = {
  id: string;
  createdAt: Date;
  kind: StockKind;
  resourceId: string;
  label: string;
  reason: StockReason;
  source: StockSource;
  delta: number | null;
  before: number | null;
  after: number | null;
  orderId: string | null;
  refundId: string | null;
  actorId: string | null;
  actorName: string | null;
  /** N° du jour de la commande liée (lecture seule, pas dans le journal). */
  orderNumber: number | null;
  note: string | null;
};

/** Noms des personnes citées (le journal ne garde que l'id, sans relation). */
async function actorNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

export async function listStockMovements(filters: StockMovementFilters) {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 30, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const where = await buildWhere(filters);
  if (!where) {
    return { movements: [], total: 0, page, pageSize, totalPages: 1 };
  }
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  const names = await actorNames([
    ...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : []))),
  ]);
  const orderIds = [
    ...new Set(rows.flatMap((r) => (r.orderId ? [r.orderId] : []))),
  ];
  // staff-visibility: exempt — ne lit que le n° du jour de commandes déjà citées par le journal de stock
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, dailyNumber: true },
      })
    : [];
  const numbers = new Map(orders.map((o) => [o.id, o.dailyNumber]));
  const movements: StockMovementRow[] = rows.map((r) => ({
    ...r,
    actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
    orderNumber: r.orderId ? (numbers.get(r.orderId) ?? null) : null,
  }));
  return {
    movements,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type StockReasonSummary = {
  reason: StockReason;
  movements: number;
  unitsIn: number;
  unitsOut: number;
};

/** Entrées et sorties par motif sur la même sélection que la liste (sans pagination). */
export async function getStockMovementSummary(
  filters: Omit<StockMovementFilters, 'page' | 'pageSize'>
): Promise<StockReasonSummary[]> {
  const where = await buildWhere(filters);
  if (!where) return [];
  const [counts, ins, outs] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ['reason'],
      where,
      _count: { _all: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['reason'],
      where: { AND: [where, { delta: { gt: 0 } }] },
      _sum: { delta: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['reason'],
      where: { AND: [where, { delta: { lt: 0 } }] },
      _sum: { delta: true },
    }),
  ]);
  const inBy = new Map(ins.map((r) => [r.reason, r._sum.delta ?? 0]));
  const outBy = new Map(outs.map((r) => [r.reason, r._sum.delta ?? 0]));
  return counts
    .map((c) => ({
      reason: c.reason,
      movements: c._count._all,
      unitsIn: inBy.get(c.reason) ?? 0,
      unitsOut: Math.abs(outBy.get(c.reason) ?? 0),
    }))
    .sort((a, b) => b.unitsOut + b.unitsIn - (a.unitsOut + a.unitsIn));
}

/** Dernier nom connu d'une ressource, pour titrer un filtre. */
export async function getResourceLabel(
  resourceId: string
): Promise<string | undefined> {
  const row = await prisma.stockMovement.findFirst({
    where: { resourceId },
    orderBy: { createdAt: 'desc' },
    select: { label: true },
  });
  return row?.label;
}
