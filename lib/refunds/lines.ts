// lib/refunds/lines.ts
//
// Lignes remboursées (produits et suppléments) : validation contre la commande et
// remise en stock. `Order.items` n'a pas d'identifiant de ligne stable (juste un
// `cartId` aléatoire côté client) : on fige un instantané sur chaque ligne.

import type { Prisma } from '@/generated/prisma/client';
import type { CartItem } from '@/lib/cart-store';
import { resolveOptionId } from '@/lib/orders/mutations/stock-needs';
import type { RefundLineInput } from '@/lib/schemas/refund';
import { logStockAnomaly, logStockChange } from '@/lib/stock-history/record';
import type { StockLogCtx } from '@/lib/stock-history/types';
import { RefundError } from './errors';

/** Refuse toute ligne que la commande ne contient pas (ou en trop grande quantité). */
export function validateRefundLines(
  items: CartItem[],
  lines: RefundLineInput[],
  amount: number
): void {
  const claimed = new Map<string, number>();
  for (const line of lines) {
    const item = items.find(
      (i) => i.cartId === line.cartId && i.productId === line.productId
    );
    if (!item) {
      throw new RefundError(
        `Ligne introuvable dans la commande : ${line.name}`
      );
    }
    let max = item.quantity;
    if (line.kind === 'SUPPLEMENT') {
      const supp = item.supplements.find(
        (s) =>
          s.groupName === line.groupName && s.optionName === line.optionName
      );
      if (!supp) {
        throw new RefundError(`Supplément introuvable : ${line.optionName}`);
      }
      max = (supp.quantity ?? 1) * item.quantity;
    }
    const key = `${line.kind}|${line.cartId}|${line.groupName ?? ''}|${line.optionName ?? ''}`;
    const total = (claimed.get(key) ?? 0) + line.quantity;
    if (total > max) {
      throw new RefundError(`Quantité trop élevée pour « ${line.name} »`);
    }
    claimed.set(key, total);
  }
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (sum > amount) {
    throw new RefundError(
      'Le montant des lignes dépasse le montant du remboursement'
    );
  }
}

type StoredLine = {
  productId: string;
  kind: 'PRODUCT' | 'SUPPLEMENT';
  groupName: string | null;
  optionName: string | null;
  quantity: number;
};

/**
 * Remet en stock les lignes remboursées. Un produit et ses suppléments sont des
 * lignes distinctes : on recrédite exactement ce qui a été coché. `NULL + n =
 * NULL` : une cible à stock illimité le reste. Une option désactivée entre-temps
 * (non résolue) est ignorée, comme pour l'édition d'une commande.
 */
export async function restoreStockForRefundLines(
  tx: Prisma.TransactionClient,
  lines: StoredLine[],
  ctx?: StockLogCtx
): Promise<void> {
  for (const line of lines) {
    if (line.kind === 'PRODUCT') {
      await tx.product.update({
        where: { id: line.productId },
        data: { stockQuantity: { increment: line.quantity } },
      });
      await logStockChange(tx, {
        kind: 'PRODUCT',
        resourceId: line.productId,
        reason: 'REFUND_RESTOCK',
        delta: line.quantity,
        ctx,
      });
      continue;
    }
    if (!line.groupName || !line.optionName) continue;
    const optionId = await resolveOptionId(
      tx,
      line.productId,
      line.groupName,
      line.optionName
    );
    if (!optionId) {
      await logStockAnomaly(tx, {
        kind: 'OPTION',
        resourceId: `${line.productId}:${line.groupName}:${line.optionName}`,
        label: `${line.groupName} · ${line.optionName}`,
        note: `Stock non rendu au remboursement : option introuvable ou désactivée (${line.quantity} unité(s))`,
        ctx,
      });
      continue;
    }
    await tx.supplementOption.update({
      where: { id: optionId },
      data: { stockQuantity: { increment: line.quantity } },
    });
    await logStockChange(tx, {
      kind: 'OPTION',
      resourceId: optionId,
      reason: 'REFUND_RESTOCK',
      delta: line.quantity,
      ctx,
    });
  }
}
