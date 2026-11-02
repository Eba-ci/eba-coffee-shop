// lib/stock-history/lock.ts
//
// Verrou de ligne sur un stock : un réglage absolu lit la valeur d'origine sans
// qu'une vente concurrente puisse s'intercaler (les décréments `UPDATE`
// attendent la fin de la transaction).

import { Prisma } from '@/generated/prisma/client';
import { parseHoldKey } from '@/lib/orders/stock-holds/keys';
import type { StockKind } from './types';

/** Stock courant verrouillé (`null` = illimité, `undefined` = ligne introuvable). */
export async function lockStock(
  tx: Prisma.TransactionClient,
  kind: StockKind,
  id: string
): Promise<number | null | undefined> {
  const rows =
    kind === 'PRODUCT'
      ? await tx.$queryRaw<{ stockQuantity: number | null }[]>`
          SELECT "stockQuantity" FROM "product" WHERE "id" = ${id} FOR UPDATE`
      : await tx.$queryRaw<{ stockQuantity: number | null }[]>`
          SELECT "stockQuantity" FROM "supplement_option" WHERE "id" = ${id} FOR UPDATE`;
  return rows.length === 0 ? undefined : rows[0].stockQuantity;
}

export type StockRowIds = {
  productIds?: Iterable<string>;
  optionIds?: Iterable<string>;
};

/**
 * Verrouille plusieurs lignes de stock D'UN COUP, dans l'ordre des identifiants
 * (produits, puis options). Deux transactions qui touchent les mêmes lignes les
 * prennent alors dans le même ordre : plus d'interblocage entre une commande
 * « café + beignet » et une commande « beignet + café ».
 */
export async function lockStockRows(
  tx: Prisma.TransactionClient,
  ids: StockRowIds
): Promise<void> {
  const products = [...new Set(ids.productIds ?? [])];
  const options = [...new Set(ids.optionIds ?? [])];
  if (products.length > 0) {
    await tx.$queryRaw`
      SELECT "id" FROM "product" WHERE "id" IN (${Prisma.join(products)})
      ORDER BY "id" FOR UPDATE`;
  }
  if (options.length > 0) {
    await tx.$queryRaw`
      SELECT "id" FROM "supplement_option" WHERE "id" IN (${Prisma.join(options)})
      ORDER BY "id" FOR UPDATE`;
  }
}

/** Même chose depuis des clés `PRODUCT:<id>` / `OPTION:<id>` (réservations, besoins). */
export function lockStockKeys(
  tx: Prisma.TransactionClient,
  keys: Iterable<string>
): Promise<void> {
  const productIds: string[] = [];
  const optionIds: string[] = [];
  for (const key of keys) {
    const { kind, id } = parseHoldKey(key);
    (kind === 'PRODUCT' ? productIds : optionIds).push(id);
  }
  return lockStockRows(tx, { productIds, optionIds });
}
