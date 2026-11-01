// lib/stock-history/order-audit-query.ts
//
// Lectures du contrôle « commande ↔ journal » : charge des commandes et leurs
// mouvements, recalcule le besoin (`aggregateStockNeeds`) et applique
// `compareOrderToJournal`. Sert l'onglet « Stock » d'une fiche produit, la page
// d'audit, la carte « Stock » d'une commande et l'outil MCP.

import { Prisma } from '@/generated/prisma/client';
import type { CartItem } from '@/lib/cart-store';
import prisma from '@/lib/prisma';
import { isDeferredPickup } from '@/lib/orders/scheduling';
import { aggregateStockNeeds } from '@/lib/orders/mutations/stock-needs';
import {
  CONSUMPTION_REASONS,
  compareOrderToJournal,
  explainOrderStock,
  isStockDefect,
  resourceKey,
  type OrderVerdict,
  type ResourceLine,
  type StockExplanation,
} from './order-audit';
import { actorNames } from './queries';
import { needsOf, sumsOf, type LedgerMovement } from './ledger-helpers';

export type { LedgerMovement } from './ledger-helpers';

/** Plafond de commandes examinées d'un coup (chaque commande coûte des lectures de résolution d'options). */
export const AUDIT_ORDER_LIMIT = 300;

export type LedgerOrder = {
  id: string;
  dailyNumber: number;
  createdAt: Date;
  status: string;
  isPaid: boolean;
  pickupTime: Date | null;
  stockReservedAt: Date | null;
  /** Quantité du produit filtré dans la commande (0 hors filtre produit). */
  productQuantity: number;
  verdict: OrderVerdict;
  explanation: StockExplanation;
  defect: boolean;
  lines: ResourceLine[];
  movements: LedgerMovement[];
};

export type LedgerFilters = {
  /** Commandes contenant ce produit ; les lignes affichées sont celles de ses ressources. */
  productId?: string;
  from?: Date;
  toExclusive?: Date;
  /** Début du journal complet (défaut : premier mouvement hors relevé de départ). */
  journalFrom?: Date | null;
  /** Commandes précises (carte « Stock » d'une commande) : court-circuite la sélection. */
  orderIds?: string[];
  /** Ne garder que les défauts et avertissements. */
  onlyIssues?: boolean;
  limit?: number;
  offset?: number;
};

/**
 * Début du journal COMPLET : le premier mouvement hors relevé de départ. Le relevé
 * est posé avant la bascule du conteneur, il ne prouve pas que les ventes sont
 * déjà journalisées.
 */
export async function getJournalStart(): Promise<Date | null> {
  const res = await prisma.stockMovement.aggregate({
    where: { reason: { not: 'BASELINE' } },
    _min: { createdAt: true },
  });
  return res._min.createdAt;
}

async function candidateIds(
  f: LedgerFilters,
  mode: 'audit' | 'product'
): Promise<{ ids: string[]; total: number }> {
  if (f.orderIds) return { ids: f.orderIds, total: f.orderIds.length };
  const limit = f.limit ?? AUDIT_ORDER_LIMIT;
  const offset = f.offset ?? 0;
  const parts: Prisma.Sql[] = [
    // Règle de visibilité recopiée de `STAFF_VISIBLE` (lib/orders/visibility.ts) :
    // le SQL brut échappe au garde-fou `withStaffVisible`.
    Prisma.sql`("paymentExpiresAt" IS NULL OR "isPaid")`,
  ];
  if (f.productId) {
    parts.push(
      Prisma.sql`"items" @> ${JSON.stringify([{ productId: f.productId }])}::jsonb`
    );
  }
  if (f.from) parts.push(Prisma.sql`"createdAt" >= ${f.from}`);
  if (f.toExclusive) parts.push(Prisma.sql`"createdAt" < ${f.toExclusive}`);
  if (mode === 'audit') {
    parts.push(
      Prisma.sql`("stockReservedAt" IS NOT NULL OR "status" IN ('PREPARING','READY','COMPLETED'))`
    );
  }
  const where = Prisma.join(parts, ' AND ');
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "order" WHERE ${where}
      ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${offset}`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "order" WHERE ${where}`,
  ]);
  return { ids: rows.map((r) => r.id), total: Number(count[0]?.n ?? 0) };
}

/**
 * Contrôle une liste de commandes. Les `lines` renvoyées sont restreintes aux
 * ressources du produit filtré (le verdict, lui, porte sur toute la commande :
 * un goût global partagé entre deux produits ne se compare pas par produit).
 */
export async function loadOrderLedger(
  f: LedgerFilters,
  mode: 'audit' | 'product'
): Promise<{
  orders: LedgerOrder[];
  total: number;
  examined: number;
  defects: number;
  warnings: number;
  journalStart: Date | null;
}> {
  const journalStart =
    f.journalFrom === undefined ? await getJournalStart() : f.journalFrom;
  const { ids, total } = await candidateIds(f, mode);
  if (ids.length === 0) {
    return {
      orders: [],
      total,
      examined: 0,
      defects: 0,
      warnings: 0,
      journalStart,
    };
  }

  const [orders, moves] = await Promise.all([
    // staff-visibility: exempt — ids déjà filtrés par la règle de visibilité en SQL (candidateIds)
    prisma.order.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        dailyNumber: true,
        createdAt: true,
        status: true,
        isPaid: true,
        pickupTime: true,
        stockReservedAt: true,
        items: true,
        stockHolds: { select: { id: true }, take: 1 },
      },
    }),
    prisma.stockMovement.findMany({
      where: { orderId: { in: ids } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const names = await actorNames([
    ...new Set(moves.flatMap((m) => (m.actorId ? [m.actorId] : []))),
  ]);
  const movesByOrder = new Map<string, LedgerMovement[]>();
  for (const m of moves) {
    if (!m.orderId) continue;
    const list = movesByOrder.get(m.orderId) ?? [];
    list.push({
      id: m.id,
      createdAt: m.createdAt,
      kind: m.kind,
      resourceId: m.resourceId,
      label: m.label,
      reason: m.reason,
      source: m.source,
      delta: m.delta,
      before: m.before,
      after: m.after,
      actorName: m.actorId ? (names.get(m.actorId) ?? null) : null,
    });
    movesByOrder.set(m.orderId, list);
  }

  const now = new Date();
  const byId = new Map(orders.map((o) => [o.id, o]));
  const out: LedgerOrder[] = [];
  for (const id of ids) {
    const o = byId.get(id);
    if (!o) continue;
    const items = o.items as unknown as CartItem[];
    const movements = movesByOrder.get(id) ?? [];
    const agg = await aggregateStockNeeds(prisma, items);
    const { verdict, lines } = compareOrderToJournal({
      needs: needsOf(agg),
      sums: sumsOf(movements),
      unresolved: agg.unresolved.size,
    });

    const launched = o.stockReservedAt !== null;
    const reference = launched ? o.stockReservedAt! : o.createdAt;
    const beforeJournal = !journalStart || reference < journalStart;
    const consumption = movements.filter((m) =>
      CONSUMPTION_REASONS.includes(m.reason)
    );
    const explanation = explainOrderStock({
      status: o.status,
      launched,
      deferred: isDeferredPickup(o.pickupTime, now),
      held: o.stockHolds.length > 0,
      beforeJournal,
      verdict,
      allUnlimited:
        consumption.length > 0 &&
        consumption.every((m) => m.before === null && m.after === null),
    });

    let shown = lines;
    let productQuantity = 0;
    if (f.productId) {
      const own = items.filter((i) => i.productId === f.productId);
      productQuantity = own.reduce((n, i) => n + i.quantity, 0);
      const mine = await aggregateStockNeeds(prisma, own);
      const keys = new Set([
        ...[...mine.products.keys()].map((k) => resourceKey('PRODUCT', k)),
        ...[...mine.options.keys()].map((k) => resourceKey('OPTION', k)),
      ]);
      shown = lines.filter((l) => keys.has(resourceKey(l.kind, l.resourceId)));
    }

    out.push({
      id,
      dailyNumber: o.dailyNumber,
      createdAt: o.createdAt,
      status: o.status,
      isPaid: o.isPaid,
      pickupTime: o.pickupTime,
      stockReservedAt: o.stockReservedAt,
      productQuantity,
      verdict,
      explanation,
      defect: isStockDefect(explanation.code),
      lines: shown,
      movements,
    });
  }

  const defects = out.filter((r) => r.defect).length;
  const warnings = out.filter((r) => r.explanation.tone === 'warn').length;
  const kept = f.onlyIssues
    ? out.filter((r) => r.defect || r.explanation.tone === 'warn')
    : out;
  return {
    orders: kept,
    total,
    examined: out.length,
    defects,
    warnings,
    journalStart,
  };
}
