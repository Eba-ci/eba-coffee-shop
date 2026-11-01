// lib/stock-history/ledger-helpers.ts
//
// Briques pures du contrôle commande ↔ journal : mouvements aplatis pour l'écran,
// besoin d'une commande en ressources, consommation journalisée par ressource.

import type { aggregateStockNeeds } from '@/lib/orders/mutations/stock-needs';
import {
  CONSUMPTION_REASONS,
  resourceKey,
  type MovementSum,
  type ResourceNeed,
} from './order-audit';
import type { StockKind, StockReason, StockSource } from './types';

export type LedgerMovement = {
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
  actorName: string | null;
};

export function needsOf(
  agg: Awaited<ReturnType<typeof aggregateStockNeeds>>
): ResourceNeed[] {
  const needs: ResourceNeed[] = [];
  for (const [id, p] of agg.products) {
    needs.push({
      kind: 'PRODUCT',
      resourceId: id,
      label: p.name,
      needed: p.needed,
    });
  }
  for (const [id, o] of agg.options) {
    needs.push({
      kind: 'OPTION',
      resourceId: id,
      label: `${o.groupName} · ${o.optionName}`,
      needed: o.needed,
    });
  }
  return needs;
}

export function sumsOf(movements: LedgerMovement[]): MovementSum[] {
  const sums = new Map<string, MovementSum>();
  for (const m of movements) {
    if (!CONSUMPTION_REASONS.includes(m.reason)) continue;
    const key = resourceKey(m.kind, m.resourceId);
    const cur = sums.get(key) ?? {
      kind: m.kind,
      resourceId: m.resourceId,
      label: m.label,
      consumed: 0,
    };
    cur.consumed -= m.delta ?? 0;
    sums.set(key, cur);
  }
  return [...sums.values()];
}
