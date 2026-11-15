// lib/orders/cart-verification.ts
//
// Vérification SERVEUR du panier d'une commande publique. Avant le paiement en
// ligne, rien n'est cru du navigateur : prix, suppléments, remise, total. Un total
// falsifié à 1 F ferait payer 1 F une commande de 5 000 F, que Jèko encaisserait
// et que le webhook enverrait en cuisine. Le prix de référence est celui du menu.
//
// Pur (le menu est passé en paramètre) : testable sans base.

import type { CartItem } from '@/lib/cart-store';
import type { AdminMenuCategory } from '@/lib/menu';
import { computeItemsTotal } from '@/lib/orders/totals';
import {
  effectiveMax,
  effectiveMin,
  isAvailableToday,
  isPausedNow,
  isWithinAnyPeriod,
} from '@/lib/supplements';

export type CartMismatchReason =
  | 'empty_cart'
  | 'product_unknown'
  | 'product_unavailable'
  | 'supplement_unknown'
  | 'supplement_invalid'
  | 'price_changed'
  | 'discount_not_allowed'
  | 'total_mismatch';

export class CartMismatchError extends Error {
  constructor(
    readonly reason: CartMismatchReason,
    message: string
  ) {
    super(message);
    this.name = 'CartMismatchError';
  }
}

/**
 * Vérifie chaque ligne contre le menu et renvoie le total serveur.
 * Lève `CartMismatchError` au premier écart.
 */
export function assertCartMatchesMenu(
  items: CartItem[],
  menu: AdminMenuCategory[],
  clientTotal: number,
  now: Date = new Date()
): number {
  if (items.length === 0) {
    throw new CartMismatchError('empty_cart', 'Panier vide');
  }

  // `getMenuAdmin` renvoie aussi les produits en pause et les catégories
  // désactivées : on les écarte ici pour les distinguer d'un produit inconnu.
  const products = new Map(
    menu.flatMap((c) => c.products.map((p) => [p.id, { p, cat: c }] as const))
  );

  for (const item of items) {
    const entry = products.get(item.productId);
    const product = entry?.p;
    if (!entry || !product) {
      throw new CartMismatchError(
        'product_unknown',
        `Produit introuvable : ${item.productName}`
      );
    }
    // `=== false` : seul un refus explicite bloque (comme `group.available`).
    // Mêmes règles que l'écran (`isOrderableNow`, hors épuisement : le stock a
    // son propre contrôle) : pause en cours, jours de la semaine (planning du
    // produit ∩ catégorie ; liste vide = tous les jours), fenêtres « spécialité
    // de la semaine ».
    const days = product.availableDays?.length ? product.availableDays : null;
    const periods = product.weeklySpecials?.length
      ? product.weeklySpecials
      : null;
    if (
      product.available === false ||
      entry.cat.available === false ||
      isPausedNow(product.unavailableUntil, now) ||
      !isAvailableToday(days, now) ||
      !isWithinAnyPeriod(periods, now)
    ) {
      throw new CartMismatchError(
        'product_unavailable',
        `« ${product.name} » n'est plus disponible`
      );
    }
    if (item.basePrice !== product.price) {
      throw new CartMismatchError(
        'price_changed',
        `Le prix de « ${product.name} » a changé`
      );
    }
    // Aucune remise sur une commande publique : c'est un geste staff.
    if ((item.discount ?? 0) !== 0) {
      throw new CartMismatchError(
        'discount_not_allowed',
        'Une remise ne peut pas être appliquée à une commande en ligne'
      );
    }

    for (const s of item.supplements) {
      const group = product.supplements.find((g) => g.name === s.groupName);
      // Deux options peuvent partager un nom dans un même groupe (renommage,
      // ancien « goût » désactivé conservé) : on préfère l'option disponible,
      // comme `buildOrderItemsFromMenu` et le décrément de stock.
      const option =
        group?.options.find((o) => o.name === s.optionName && o.available) ??
        group?.options.find((o) => o.name === s.optionName);
      if (!group || !option) {
        throw new CartMismatchError(
          'supplement_unknown',
          `Supplément introuvable pour « ${product.name} » : ${s.groupName} / ${s.optionName}`
        );
      }
      if (s.price !== option.price) {
        throw new CartMismatchError(
          'price_changed',
          `Le prix de « ${s.optionName} » a changé`
        );
      }
      if (!option.available) {
        throw new CartMismatchError(
          'supplement_invalid',
          `« ${s.optionName} » n'est plus proposé pour « ${product.name} »`
        );
      }
    }

    assertGroupRules(item, product);
  }

  const serverTotal = computeItemsTotal(items);
  if (clientTotal !== serverTotal) {
    throw new CartMismatchError(
      'total_mismatch',
      `Total reçu ${clientTotal} F ≠ total calculé ${serverTotal} F`
    );
  }
  return serverTotal;
}

/**
 * Règles de sélection de chaque groupe (requis, bornes, quantités), les mêmes
 * que l'écran. Sans elles un client pourrait commander une boîte de 4 parts avec
 * 1 seule, ou sans le lait requis : le prix serait juste, la cuisine recevrait
 * une commande mal formée. Les groupes à nom dupliqué sont ignorés : on ne sait
 * pas à quel groupe rattacher une ligne.
 */
function assertGroupRules(
  item: CartItem,
  product: AdminMenuCategory['products'][number]
) {
  for (const group of product.supplements) {
    // Un groupe masqué au public ne peut pas être exigé du client.
    if (group.available === false) continue;
    if (product.supplements.filter((g) => g.name === group.name).length > 1) {
      continue;
    }
    const picked = item.supplements.filter((s) => s.groupName === group.name);
    const isQuantity = group.type === 'quantity';
    const names = picked.map((s) => s.optionName);
    const count = picked.reduce((n, s) => n + (s.quantity ?? 1), 0);
    const valid =
      count >= effectiveMin(group as never) &&
      count <= effectiveMax(group as never) &&
      picked.every(
        (s) =>
          Number.isInteger(s.quantity ?? 1) &&
          (s.quantity ?? 1) >= 1 &&
          (isQuantity || (s.quantity ?? 1) === 1)
      ) &&
      (isQuantity || new Set(names).size === names.length);
    if (!valid) {
      throw new CartMismatchError(
        'supplement_invalid',
        `Choix invalide pour « ${group.name} » (${product.name})`
      );
    }
  }
}
