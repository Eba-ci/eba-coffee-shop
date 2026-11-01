// lib/stock-history/record.ts
//
// SEUL écrivain du journal de stock. À appeler dans la transaction qui modifie
// `stockQuantity`, APRÈS l'écriture : on relit la valeur finale (la ligne est
// verrouillée par notre propre update, donc la lecture est cohérente), puis
// `before = after − delta`. Stock illimité (`null`) : `before`/`after` restent
// à null mais `delta` est conservé, pour voir ce qui se vend quand même.

import type { Prisma } from '@/generated/prisma/client';
import { ambientStockContext } from './source-context';
import type { StockKind, StockLogCtx, StockReason } from './types';

type Snapshot = { label: string; stock: number | null } | null;

async function snapshotOf(
  tx: Prisma.TransactionClient,
  kind: StockKind,
  id: string
): Promise<Snapshot> {
  if (kind === 'PRODUCT') {
    const p = await tx.product.findUnique({
      where: { id },
      select: { name: true, stockQuantity: true },
    });
    return p ? { label: p.name, stock: p.stockQuantity } : null;
  }
  const o = await tx.supplementOption.findUnique({
    where: { id },
    select: {
      name: true,
      stockQuantity: true,
      group: { select: { name: true, product: { select: { name: true } } } },
    },
  });
  if (!o) return null;
  const parts = [o.group.product?.name, o.group.name, o.name].filter(Boolean);
  return { label: parts.join(' · '), stock: o.stockQuantity };
}

function row(
  kind: StockKind,
  resourceId: string,
  label: string,
  reason: StockReason,
  v: { delta: number | null; before: number | null; after: number | null },
  ctx?: StockLogCtx
): Prisma.StockMovementCreateManyInput {
  const ambient = ambientStockContext();
  return {
    kind,
    resourceId,
    label,
    reason,
    delta: v.delta,
    before: v.before,
    after: v.after,
    source: ctx?.source ?? ambient?.source ?? 'STAFF',
    orderId: ctx?.orderId ?? null,
    refundId: ctx?.refundId ?? null,
    actorId: ctx?.actorId ?? ambient?.actorId ?? null,
    note: ctx?.note ?? null,
  };
}

/**
 * Journalise une variation relative déjà appliquée (`delta` signé : − sortie,
 * + entrée). Cible disparue entre-temps : ligne écrite avec l'id comme libellé.
 */
export async function logStockChange(
  tx: Prisma.TransactionClient,
  input: {
    kind: StockKind;
    resourceId: string;
    reason: StockReason;
    delta: number;
    ctx?: StockLogCtx;
  }
): Promise<void> {
  if (input.delta === 0) return;
  const snap = await snapshotOf(tx, input.kind, input.resourceId);
  const after = snap?.stock ?? null;
  const before = after === null ? null : after - input.delta;
  await tx.stockMovement.create({
    data: row(
      input.kind,
      input.resourceId,
      snap?.label ?? input.resourceId,
      input.reason,
      { delta: input.delta, before, after },
      input.ctx
    ),
  });
}

/**
 * Journalise une valeur posée (réglage manuel, formulaire, création) :
 * `delta = after − before` quand les deux sont connus.
 */
export async function logStockSet(
  tx: Prisma.TransactionClient,
  input: {
    kind: StockKind;
    resourceId: string;
    reason: StockReason;
    before: number | null;
    after: number | null;
    label?: string;
    /** Remplace `after − before` (ex. option supprimée : tout le stock est perdu). */
    delta?: number | null;
    ctx?: StockLogCtx;
  }
): Promise<void> {
  if (input.before === input.after && input.reason !== 'CREATED') return;
  const label =
    input.label ??
    (await snapshotOf(tx, input.kind, input.resourceId))?.label ??
    input.resourceId;
  const delta =
    input.delta !== undefined
      ? input.delta
      : input.before !== null && input.after !== null
        ? input.after - input.before
        : null;
  await tx.stockMovement.create({
    data: row(
      input.kind,
      input.resourceId,
      label,
      input.reason,
      { delta, before: input.before, after: input.after },
      input.ctx
    ),
  });
}

/** Trace un événement sans variation (anomalie détectée, restock ignoré…). */
export async function logStockAnomaly(
  tx: Prisma.TransactionClient,
  input: {
    kind: StockKind;
    resourceId: string;
    label: string;
    note: string;
    ctx?: StockLogCtx;
  }
): Promise<void> {
  await tx.stockMovement.create({
    data: row(
      input.kind,
      input.resourceId,
      input.label,
      'ANOMALY',
      { delta: 0, before: null, after: null },
      { ...input.ctx, note: input.note }
    ),
  });
}
