import prisma from '@/lib/prisma';
import { triggerRestockAlerts } from '@/lib/restock-alerts';
import { reserveForScheduledOrdersSafe } from '@/lib/orders/stock-holds';
import { logStockChange, logStockSet } from '@/lib/stock-history/record';
import { lockStock } from '@/lib/stock-history/lock';
import type { StockKind, StockReason } from '@/lib/stock-history/types';

/**
 * Options d'une mise à jour de stock. `reserveForScheduled: false` garde le stock
 * au comptoir (cas « cette fournée n'est pas pour les programmées ») ; par défaut,
 * les programmées payées du jour prennent leur part, par heure de retrait.
 * `actorId` : la personne à l'origine du geste (journal du stock).
 */
export type StockWriteOptions = {
  reserveForScheduled?: boolean;
  actorId?: string | null;
};

async function afterStockChange(opts?: StockWriteOptions) {
  triggerRestockAlerts();
  if (opts?.reserveForScheduled !== false) {
    await reserveForScheduledOrdersSafe();
  }
}

const NOT_FOUND: Record<StockKind, string> = {
  PRODUCT: 'Produit introuvable',
  OPTION: 'Option introuvable',
};

/** Pose une valeur absolue et la journalise. */
async function setStock(
  kind: StockKind,
  id: string,
  quantity: number | null,
  reason: StockReason,
  opts?: StockWriteOptions
) {
  const updated = await prisma.$transaction(async (tx) => {
    const before = await lockStock(tx, kind, id);
    if (before === undefined) throw new Error(NOT_FOUND[kind]);
    const row =
      kind === 'PRODUCT'
        ? await tx.product.update({
            where: { id },
            data: { stockQuantity: quantity },
          })
        : await tx.supplementOption.update({
            where: { id },
            data: { stockQuantity: quantity },
          });
    await logStockSet(tx, {
      kind,
      resourceId: id,
      reason,
      before,
      after: quantity,
      ctx: { actorId: opts?.actorId },
    });
    return row;
  });
  await afterStockChange(opts);
  return updated;
}

/** Ajoute (ou retire) des unités et le journalise ; jamais sous zéro. */
async function restock(
  kind: StockKind,
  id: string,
  delta: number,
  opts?: StockWriteOptions
) {
  const updated = await prisma.$transaction(async (tx) => {
    const before = await lockStock(tx, kind, id);
    if (before === undefined) throw new Error(NOT_FOUND[kind]);
    if (before === null) {
      throw new Error(
        kind === 'PRODUCT'
          ? 'Produit à stock illimité : impossible de réapprovisionner'
          : 'Option à stock illimité : impossible de réapprovisionner'
      );
    }
    if (before + delta < 0) {
      throw new Error(
        `Stock insuffisant : ${before} en stock, impossible de retirer ${-delta}`
      );
    }
    const data = { stockQuantity: { increment: delta } };
    const row =
      kind === 'PRODUCT'
        ? await tx.product.update({ where: { id }, data })
        : await tx.supplementOption.update({ where: { id }, data });
    await logStockChange(tx, {
      kind,
      resourceId: id,
      reason: 'MANUAL_RESTOCK',
      delta,
      ctx: { actorId: opts?.actorId },
    });
    return row;
  });
  await afterStockChange(opts);
  return updated;
}

export function setProductStock(
  id: string,
  quantity: number | null,
  opts?: StockWriteOptions
) {
  return setStock('PRODUCT', id, quantity, 'MANUAL_SET', opts);
}

export function setOptionStock(
  id: string,
  quantity: number | null,
  opts?: StockWriteOptions
) {
  return setStock('OPTION', id, quantity, 'MANUAL_SET', opts);
}

export function restockProduct(
  id: string,
  delta: number,
  opts?: StockWriteOptions
) {
  return restock('PRODUCT', id, delta, opts);
}

export function restockOption(
  id: string,
  delta: number,
  opts?: StockWriteOptions
) {
  return restock('OPTION', id, delta, opts);
}

export async function setOptionStockByRef(
  input: {
    productId: string;
    groupName: string;
    optionName: string;
    stock: number;
  },
  opts?: StockWriteOptions
): Promise<{ stockQuantity: number | null }> {
  const option = await prisma.supplementOption.findFirst({
    where: {
      name: input.optionName,
      // Groupe propre au produit OU global (« Extras »), même résolution que
      // `decrementStockForOrderItems` (lib/order-mutations.ts).
      group: {
        name: input.groupName,
        OR: [{ productId: input.productId }, { isGlobal: true }],
      },
    },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (!option) throw new Error('Option introuvable');

  const updated = await setStock(
    'OPTION',
    option.id,
    input.stock,
    'MANUAL_SET',
    opts
  );
  return { stockQuantity: updated.stockQuantity };
}

export async function setProductStockById(
  input: {
    productId: string;
    stock: number;
  },
  opts?: StockWriteOptions
): Promise<{ stockQuantity: number | null }> {
  const updated = await setStock(
    'PRODUCT',
    input.productId,
    input.stock,
    'MANUAL_SET',
    opts
  );
  return { stockQuantity: updated.stockQuantity };
}
