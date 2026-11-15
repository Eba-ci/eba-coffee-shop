// Le serveur ne croit rien du panier client : prix, suppléments, remise et total sont revérifiés contre le menu en base.

import { describe, expect, it } from 'vitest';
import { CartMismatchError, assertCartMatchesMenu } from './cart-verification';
import { menu, item } from './cart-verification.test-utils';

describe('assertCartMatchesMenu', () => {
  it('renvoie le total serveur quand tout correspond au menu', () => {
    const items = [
      item({
        quantity: 2,
        supplements: [
          { groupName: 'Taille', optionName: 'Grand', price: 500, quantity: 1 },
        ],
      }),
      item({ cartId: 'c2', productId: 'p2', basePrice: 2000 }),
    ];
    // (1500 + 500) × 2 + 2000
    expect(assertCartMatchesMenu(items, menu, 6000)).toBe(6000);
  });

  it('refuse un prix de base différent du menu', () => {
    expect(() =>
      assertCartMatchesMenu([item({ basePrice: 1 })], menu, 1)
    ).toThrow(CartMismatchError);
  });

  it('refuse un prix de supplément différent du menu', () => {
    const items = [
      item({
        supplements: [
          { groupName: 'Taille', optionName: 'Grand', price: 0, quantity: 1 },
        ],
      }),
    ];
    expect(() => assertCartMatchesMenu(items, menu, 1500)).toThrow(
      CartMismatchError
    );
  });

  it('compare au prix de l’option DISPONIBLE quand deux options portent le même nom', () => {
    const items = [
      item({
        supplements: [
          { groupName: 'Goût', optionName: 'Vanille', price: 400, quantity: 1 },
        ],
      }),
    ];
    expect(assertCartMatchesMenu(items, menu, 1900)).toBe(1900);
  });

  it('refuse un produit inconnu', () => {
    expect(() =>
      assertCartMatchesMenu([item({ productId: 'fantome' })], menu, 1500)
    ).toThrow(CartMismatchError);
  });

  it('refuse un groupe ou une option de supplément inconnus', () => {
    const unknownGroup = item({
      supplements: [
        { groupName: 'Secret', optionName: 'Grand', price: 0, quantity: 1 },
      ],
    });
    const unknownOption = item({
      supplements: [
        { groupName: 'Taille', optionName: 'Géant', price: 0, quantity: 1 },
      ],
    });
    expect(() => assertCartMatchesMenu([unknownGroup], menu, 1500)).toThrow(
      CartMismatchError
    );
    expect(() => assertCartMatchesMenu([unknownOption], menu, 1500)).toThrow(
      CartMismatchError
    );
  });

  it('refuse toute remise : un client ne se fait pas de remise lui-même', () => {
    expect(() =>
      assertCartMatchesMenu([item({ discount: 100 })], menu, 1400)
    ).toThrow(CartMismatchError);
  });

  it('refuse un total différent de la somme des lignes', () => {
    expect(() => assertCartMatchesMenu([item()], menu, 1)).toThrow(
      CartMismatchError
    );
  });

  it('refuse un panier vide', () => {
    expect(() => assertCartMatchesMenu([], menu, 0)).toThrow(CartMismatchError);
  });

  it('identifie la cause dans `reason`, pour que le client sache quoi faire', () => {
    const reason = (fn: () => unknown) => {
      try {
        fn();
      } catch (err) {
        return (err as CartMismatchError).reason;
      }
    };
    expect(
      reason(() => assertCartMatchesMenu([item({ basePrice: 1 })], menu, 1))
    ).toBe('price_changed');
    expect(
      reason(() =>
        assertCartMatchesMenu([item({ productId: 'fantome' })], menu, 1500)
      )
    ).toBe('product_unknown');
    expect(reason(() => assertCartMatchesMenu([item()], menu, 1))).toBe(
      'total_mismatch'
    );
  });

  describe('disponibilité du produit', () => {
    const withFlags = (product: boolean | undefined, category?: boolean) =>
      [
        {
          ...(menu as never as Record<string, unknown>[])[0],
          available: category,
          products: (
            menu as never as { products: Record<string, unknown>[] }[]
          )[0].products.map((p) =>
            p.id === 'p2' ? { ...p, available: product } : p
          ),
        },
      ] as never;
    const cart = [item({ productId: 'p2', basePrice: 2000 })];
    const reasonOf = (m: never) => {
      try {
        assertCartMatchesMenu(cart, m, 2000);
      } catch (e) {
        return (e as CartMismatchError).reason;
      }
      return null;
    };

    it('refuse un produit mis en pause (available: false)', () => {
      expect(reasonOf(withFlags(false, true))).toBe('product_unavailable');
    });

    it('refuse un produit dont la catégorie est désactivée', () => {
      expect(reasonOf(withFlags(true, false))).toBe('product_unavailable');
    });

    const withProduct = (patch: Record<string, unknown>) =>
      [
        {
          ...(menu as never as Record<string, unknown>[])[0],
          products: (
            menu as never as { products: Record<string, unknown>[] }[]
          )[0].products.map((p) => (p.id === 'p2' ? { ...p, ...patch } : p)),
        },
      ] as never;
    const reasonAt = (m: never, now: Date) => {
      try {
        assertCartMatchesMenu(cart, m, 2000, now);
      } catch (e) {
        return (e as CartMismatchError).reason;
      }
      return null;
    };
    // 2026-11-18 = mercredi (Abidjan = UTC).
    const wed = new Date('2026-11-18T10:00:00Z');

    it('refuse un produit en pause (unavailableUntil dans le futur)', () => {
      const m = withProduct({
        unavailableUntil: new Date('2026-11-19T00:00:00Z'),
      });
      expect(reasonAt(m, wed)).toBe('product_unavailable');
    });

    it('accepte un produit dont la pause est terminée', () => {
      const m = withProduct({
        unavailableUntil: new Date('2026-11-17T00:00:00Z'),
      });
      expect(reasonAt(m, wed)).toBeNull();
    });

    it('refuse un produit hors de ses jours de la semaine', () => {
      expect(reasonAt(withProduct({ availableDays: [1, 2] }), wed)).toBe(
        'product_unavailable'
      );
      expect(reasonAt(withProduct({ availableDays: [3] }), wed)).toBeNull();
      expect(reasonAt(withProduct({ availableDays: [] }), wed)).toBeNull();
    });

    it('refuse une spécialité de la semaine hors de sa fenêtre', () => {
      const out = [
        { id: 'w', startDate: '2026-12-01', endDate: '2026-12-07', note: null },
      ];
      const inn = [
        { id: 'w', startDate: '2026-11-16', endDate: '2026-11-22', note: null },
      ];
      expect(reasonAt(withProduct({ weeklySpecials: out }), wed)).toBe(
        'product_unavailable'
      );
      expect(reasonAt(withProduct({ weeklySpecials: inn }), wed)).toBeNull();
    });

    it('accepte un produit et une catégorie disponibles', () => {
      expect(reasonOf(withFlags(true, true))).toBeNull();
    });
  });
});
