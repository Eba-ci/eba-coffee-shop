// lib/orders/pending-demand.ts
//
// Visibilité PURE LECTURE de la quantité déjà « voulue » par des commandes dont
// le stock n'est PAS encore réservé (`stockReservedAt: null`, statut différent
// de CANCELLED), par produit et par option. N'écrit rien et n'interagit pas
// avec `reserveStockOnce` (lib/order-mutations.ts) : le stock réel est
// décrémenté à l'ENTRÉE EN CUISINE, une seule fois, sous verrou
// `Order.stockReservedAt`.
//
// Le critère est donc bien `stockReservedAt` et non `isPaid` : une commande
// impayée déjà partie en cuisine (ardoise) a son stock DÉJÀ déduit de
// `stockQuantity` — la compter ici la ferait apparaître deux fois (une fois
// dans le stock restant, une fois dans la demande en attente).
//
// Sert uniquement à afficher, à côté du stock restant, ce qui est déjà
// potentiellement engagé par des commandes pas encore parties en cuisine.

import prisma from '@/lib/prisma';
import { withStaffVisible } from '@/lib/orders/visibility';
import type { CartItem } from '@/lib/cart-store';
import type { MenuCategory } from '@/config/menu';
import { parseDateOnlyToUTC } from '@/lib/timezone';
import { holdKey } from '@/lib/orders/stock-holds/keys';
import { loadHoldsForOrders } from '@/lib/orders/stock-holds/holds';

export type PendingDemand = {
  /** Quantité en attente par `productId`. */
  products: Map<string, number>;
  /** Quantité en attente par `id` d'option (résolue par nom, voir ci-dessous). */
  options: Map<string, number>;
};

export type PendingDemandOptions = {
  /**
   * Jour civil Abidjan (YYYY-MM-DD) : ne compte que les commandes à produire
   * CE jour-là — jour de retrait s'il existe, sinon jour de création. Absent =
   * toutes dates confondues (comportement historique, inchangé pour les écrans
   * de stock qui ne raisonnent pas par date).
   */
  day?: string;
};

export async function getPendingDemand(
  options_?: PendingDemandOptions
): Promise<PendingDemand> {
  // Abidjan étant à UTC+0, `parseDateOnlyToUTC` donne exactement la borne du
  // jour civil. Le `OR` traduit « jour de retrait, sinon jour de création ».
  const start = options_?.day ? parseDateOnlyToUTC(options_.day) : null;
  const end = start ? new Date(start.getTime() + 86_400_000) : null;
  const dayFilter =
    start && end
      ? {
          OR: [
            { pickupTime: { gte: start, lt: end } },
            { pickupTime: null, createdAt: { gte: start, lt: end } },
          ],
        }
      : {};

  const [orders, options] = await Promise.all([
    prisma.order.findMany({
      where: withStaffVisible({
        stockReservedAt: null,
        status: { not: 'CANCELLED' },
        ...dayFilter,
      }),
      select: { id: true, items: true },
    }),
    prisma.supplementOption.findMany({
      where: { available: true },
      select: {
        id: true,
        name: true,
        group: { select: { name: true, productId: true, isGlobal: true } },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  // Résolution (nom d'option, nom de groupe, produit) → `id` d'option, avec
  // la même règle que `decrementStockForOrderItems` (lib/order-mutations.ts) :
  // le groupe est propre au produit OU global, et on prend la plus ancienne
  // option disponible correspondante (tri par id déjà fait ci-dessus).
  function resolveOptionId(
    productId: string,
    groupName: string,
    optionName: string
  ): string | undefined {
    return options.find(
      (o) =>
        o.name === optionName &&
        o.group.name === groupName &&
        (o.group.productId === productId || o.group.isGlobal)
    )?.id;
  }

  const products = new Map<string, number>();
  const optionDemand = new Map<string, number>();

  for (const order of orders) {
    const items = order.items as CartItem[];
    for (const item of items) {
      products.set(
        item.productId,
        (products.get(item.productId) ?? 0) + item.quantity
      );

      for (const supplement of item.supplements) {
        const optionId = resolveOptionId(
          item.productId,
          supplement.groupName,
          supplement.optionName
        );
        if (!optionId) continue;
        const needed = (supplement.quantity ?? 1) * item.quantity;
        optionDemand.set(optionId, (optionDemand.get(optionId) ?? 0) + needed);
      }
    }
  }

  // Parts déjà réservées pour ces commandes (programmées payées du jour, cf.
  // lib/orders/stock-holds) : elles sont DÉJÀ sorties de `stockQuantity`, les
  // compter ici les ferait apparaître deux fois.
  const holds = await loadHoldsForOrders(
    prisma,
    orders.map((o) => o.id)
  );
  for (const held of holds.values()) {
    for (const [id, qty] of products) {
      const reserved = held.get(holdKey('PRODUCT', id)) ?? 0;
      if (reserved > 0) products.set(id, Math.max(0, qty - reserved));
    }
    for (const [id, qty] of optionDemand) {
      const reserved = held.get(holdKey('OPTION', id)) ?? 0;
      if (reserved > 0) optionDemand.set(id, Math.max(0, qty - reserved));
    }
  }
  for (const [id, qty] of products) if (qty === 0) products.delete(id);
  for (const [id, qty] of optionDemand) if (qty === 0) optionDemand.delete(id);

  return { products, options: optionDemand };
}

/** Raccourci pratique quand seule la demande par option est nécessaire. */
export async function getPendingOptionDemand(
  options_?: PendingDemandOptions
): Promise<Map<string, number>> {
  const { options } = await getPendingDemand(options_);
  return options;
}

/**
 * Fusionne la demande en attente PAR PRODUIT dans un menu caisse — même
 * patron que `attachPopularity` (lib/menu-popularity.ts) : calculé à part de
 * `getMenu()`, jamais dedans, pour ne jamais fuiter côté public. Scope
 * produit uniquement (pas les options/goûts, déjà couverts par l'écran
 * dédié `/dashboard/menu/stock-supplements`) : c'est le niveau où l'incident
 * réel (choux vendus au comptoir pendant qu'un paiement en ligne était en
 * cours) s'est produit.
 */
export function attachPendingDemand(
  menu: MenuCategory[],
  pending: Map<string, number>
): MenuCategory[] {
  return menu.map((category) => ({
    ...category,
    products: category.products.map((product) => {
      const qty = pending.get(product.id);
      return qty ? { ...product, pending: qty } : product;
    }),
  }));
}
