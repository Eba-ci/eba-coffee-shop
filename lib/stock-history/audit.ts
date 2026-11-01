// lib/stock-history/audit.ts
//
// Angles morts du stock : ce que le journal ne suffit pas à expliquer. Une dérive
// = le stock actuel diffère du dernier `after` journalisé, donc une écriture est
// passée sans laisser de trace (ou à l'instant même d'une vente concurrente).

import prisma from '@/lib/prisma';
import type { StockKind } from './types';

export type StockDrift = {
  kind: StockKind;
  resourceId: string;
  label: string;
  expected: number;
  actual: number;
  lastMovementAt: Date;
};

export type UntrackedStock = {
  kind: StockKind;
  resourceId: string;
  label: string;
  stock: number;
};

export type StockAudit = {
  drifts: StockDrift[];
  /** Stock suivi mais sans aucune ligne de journal : un relevé de départ manque. */
  untracked: UntrackedStock[];
  negatives: UntrackedStock[];
  /** Réservations dont la ressource n'existe plus : leur stock ne sera jamais rendu. */
  orphanHolds: {
    orderId: string;
    kind: StockKind;
    resourceId: string;
    quantity: number;
  }[];
  /** Mouvements `ANOMALY` des 30 derniers jours (stock non rendu, etc.). */
  recentAnomalies: number;
};

type DriftRow = {
  kind: StockKind;
  resourceId: string;
  label: string;
  expected: number;
  actual: number;
  lastMovementAt: Date;
};

async function findDrifts(): Promise<StockDrift[]> {
  const rows = await prisma.$queryRaw<DriftRow[]>`
    WITH last AS (
      SELECT DISTINCT ON ("resourceId") "kind", "resourceId", "label", "after", "createdAt"
      FROM stock_movement
      WHERE "reason" <> 'ANOMALY'
      ORDER BY "resourceId", "createdAt" DESC, "id" DESC
    )
    SELECT l."kind", l."resourceId", l."label", l."after" AS expected,
           COALESCE(p."stockQuantity", o."stockQuantity") AS actual,
           l."createdAt" AS "lastMovementAt"
    FROM last l
    LEFT JOIN product p ON l."kind" = 'PRODUCT' AND p."id" = l."resourceId"
    LEFT JOIN supplement_option o ON l."kind" = 'OPTION' AND o."id" = l."resourceId"
    WHERE l."after" IS NOT NULL
      AND (p."id" IS NOT NULL OR o."id" IS NOT NULL)
      AND COALESCE(p."stockQuantity", o."stockQuantity") IS DISTINCT FROM l."after"
    ORDER BY l."createdAt" DESC
    LIMIT 200`;
  return rows;
}

async function findUntracked(): Promise<UntrackedStock[]> {
  return prisma.$queryRaw<UntrackedStock[]>`
    SELECT 'PRODUCT'::"StockHoldKind" AS kind, p."id" AS "resourceId", p."name" AS label, p."stockQuantity" AS stock
    FROM product p
    WHERE p."stockQuantity" IS NOT NULL AND p."deletedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM stock_movement m WHERE m."resourceId" = p."id")
    UNION ALL
    SELECT 'OPTION'::"StockHoldKind", o."id", g."name" || ' · ' || o."name", o."stockQuantity"
    FROM supplement_option o JOIN supplement_group g ON g."id" = o."groupId"
    WHERE o."stockQuantity" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM stock_movement m WHERE m."resourceId" = o."id")
    LIMIT 500`;
}

async function findNegatives(): Promise<UntrackedStock[]> {
  return prisma.$queryRaw<UntrackedStock[]>`
    SELECT 'PRODUCT'::"StockHoldKind" AS kind, p."id" AS "resourceId", p."name" AS label, p."stockQuantity" AS stock
    FROM product p WHERE p."stockQuantity" < 0
    UNION ALL
    SELECT 'OPTION'::"StockHoldKind", o."id", g."name" || ' · ' || o."name", o."stockQuantity"
    FROM supplement_option o JOIN supplement_group g ON g."id" = o."groupId"
    WHERE o."stockQuantity" < 0`;
}

async function findOrphanHolds() {
  return prisma.$queryRaw<StockAudit['orphanHolds']>`
    SELECT h."orderId", h."kind", h."resourceId", h."quantity"
    FROM order_stock_hold h
    WHERE (h."kind" = 'PRODUCT' AND NOT EXISTS (SELECT 1 FROM product p WHERE p."id" = h."resourceId"))
       OR (h."kind" = 'OPTION' AND NOT EXISTS (SELECT 1 FROM supplement_option o WHERE o."id" = h."resourceId"))
    LIMIT 200`;
}

export async function runStockAudit(now = new Date()): Promise<StockAudit> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [drifts, untracked, negatives, orphanHolds, recentAnomalies] =
    await Promise.all([
      findDrifts(),
      findUntracked(),
      findNegatives(),
      findOrphanHolds(),
      prisma.stockMovement.count({
        where: { reason: 'ANOMALY', createdAt: { gte: since } },
      }),
    ]);
  return { drifts, untracked, negatives, orphanHolds, recentAnomalies };
}

/**
 * Relevé de départ : une ligne `BASELINE` par ressource à stock suivi qui n'a
 * encore aucune ligne de journal. Idempotent (rejouable sans doublon).
 */
export async function recordStockBaseline(): Promise<number> {
  const untracked = await findUntracked();
  if (untracked.length === 0) return 0;
  await prisma.stockMovement.createMany({
    data: untracked.map((u) => ({
      kind: u.kind,
      resourceId: u.resourceId,
      label: u.label,
      reason: 'BASELINE' as const,
      source: 'SYSTEM' as const,
      delta: null,
      before: null,
      after: u.stock,
      note: 'Relevé de départ du journal de stock',
    })),
  });
  return untracked.length;
}
