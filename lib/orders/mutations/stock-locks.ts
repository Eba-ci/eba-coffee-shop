// lib/orders/mutations/stock-locks.ts
//
// Ordre de verrouillage du stock côté commande. Un décompte modifie plusieurs lignes
// (le produit, ses goûts) ; deux commandes qui contiennent les mêmes produits dans un
// ordre différent les verrouillaient dans l'ordre de leur panier et se bloquaient
// mutuellement : Postgres abandonnait l'une des deux (« deadlock detected ») et la
// commande n'entrait pas en cuisine.
//
// Règle : toute opération qui touche plusieurs lignes de stock les verrouille TOUTES,
// d'un seul coup et dans l'ordre des identifiants (`lockStockRows`,
// lib/stock-history/lock.ts), AVANT de les modifier. Les écritures qui suivent ne
// bloquent plus, et toutes les transactions prennent leurs verrous dans le même ordre.
//
// Limite connue : `aggregateStockNeeds` ne renvoie pas un goût dont l'option a été
// renommée ou supprimée (introuvable). Sa ligne n'est donc pas verrouillée ici ; elle
// n'est de toute façon pas décomptée, et le retrait la traite en anomalie
// (`logStockAnomaly`), sans écriture sur une ligne de stock.

import type { Prisma } from '@/generated/prisma/client';
import type { CartItem } from '@/lib/cart-store';
import { loadHolds } from '@/lib/orders/stock-holds/holds';
import { parseHoldKey } from '@/lib/orders/stock-holds/keys';
import { lockStockRows } from '@/lib/stock-history/lock';
import { aggregateStockNeeds } from './stock-needs';

/**
 * Verrouille tout ce qu'une commande peut toucher : le besoin de chaque contenu
 * fourni (ancien et nouveau lors d'une édition) et ses réservations en cours.
 */
export async function lockStockForOrder(
  tx: Prisma.TransactionClient,
  orderId: string | undefined,
  itemLists: CartItem[][]
): Promise<void> {
  const productIds = new Set<string>();
  const optionIds = new Set<string>();
  for (const items of itemLists) {
    const needs = await aggregateStockNeeds(tx, items);
    for (const id of needs.products.keys()) productIds.add(id);
    for (const id of needs.options.keys()) optionIds.add(id);
  }
  if (orderId) {
    for (const key of (await loadHolds(tx, orderId)).keys()) {
      const { kind, id } = parseHoldKey(key);
      (kind === 'PRODUCT' ? productIds : optionIds).add(id);
    }
  }
  await lockStockRows(tx, { productIds, optionIds });
}
