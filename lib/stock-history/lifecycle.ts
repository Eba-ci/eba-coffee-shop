// lib/stock-history/lifecycle.ts
//
// Naissance et disparition d'un stock suivi : création d'un produit/d'une option
// avec une quantité, suppression ou renommage (qui recrée la ligne) d'une option.
// Une option supprimée emporte son stock avec elle ; sans trace, la quantité
// disparaissait sans que personne sache pourquoi.

import type { Prisma } from '@/generated/prisma/client';
import { logStockSet } from './record';
import type { StockKind, StockLogCtx } from './types';

type Tracked = { id: string; stockQuantity: number | null };

/** Stock initial d'ressources tout juste créées (les stocks illimités ne sont pas tracés). */
export async function logCreated(
  tx: Prisma.TransactionClient,
  kind: StockKind,
  rows: (Tracked & { label: string })[],
  ctx?: StockLogCtx
): Promise<void> {
  for (const r of rows) {
    if (r.stockQuantity === null) continue;
    await logStockSet(tx, {
      kind,
      resourceId: r.id,
      reason: 'CREATED',
      before: null,
      after: r.stockQuantity,
      delta: r.stockQuantity,
      label: r.label,
      ctx,
    });
  }
}

/** À appeler AVANT la suppression : le stock restant disparaît avec les options. */
export async function logOptionsRemoved(
  tx: Prisma.TransactionClient,
  rows: (Tracked & { label: string })[],
  ctx?: StockLogCtx
): Promise<void> {
  for (const r of rows) {
    if (r.stockQuantity === null) continue;
    await logStockSet(tx, {
      kind: 'OPTION',
      resourceId: r.id,
      reason: 'OPTION_REMOVED',
      before: r.stockQuantity,
      after: null,
      delta: -r.stockQuantity,
      label: r.label,
      ctx: {
        ...ctx,
        note: 'Option supprimée ou renommée : son stock disparaît avec elle',
      },
    });
  }
}
