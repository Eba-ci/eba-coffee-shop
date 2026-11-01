// lib/stock-history/lock.ts
//
// Verrou de ligne sur un stock : un réglage absolu lit la valeur d'origine sans
// qu'une vente concurrente puisse s'intercaler (les décréments `UPDATE`
// attendent la fin de la transaction).

import type { Prisma } from '@/generated/prisma/client';
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
