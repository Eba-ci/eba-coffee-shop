import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stock-history/record', async () =>
  (await import('@/lib/stock-history/test-mocks')).recordMock()
);
vi.mock('@/lib/stock-history/lifecycle', async () =>
  (await import('@/lib/stock-history/test-mocks')).lifecycleMock()
);
vi.mock('@/lib/stock-history/lock', async () =>
  (await import('@/lib/stock-history/test-mocks')).lockMock()
);

vi.mock('@/lib/prisma', async () =>
  (await import('./test-mocks')).prismaModuleMock()
);
vi.mock('@/lib/push-notify', async () =>
  (await import('./test-mocks')).pushNotifyModuleMock()
);
vi.mock('@/lib/customer-mutations', async () =>
  (await import('./test-mocks')).customerMutationsModuleMock()
);
vi.mock('@/lib/loyalty-mutations', async () =>
  (await import('./test-mocks')).loyaltyMutationsModuleMock()
);

import {
  updateOrderItems,
  OrderMutationError,
  StockShortageError,
} from '@/lib/order-mutations';
import type { CartItem } from '@/lib/cart-store';
import {
  mockOrderFindUnique,
  mockOrderUpdate,
  mockProdUpdateMany,
  mockOptionFindFirst,
  mockOptionUpdateMany,
} from './test-utils';

// Couverture reprise de la correction parallèle de `master` (« Décrémente le
// stock sur une hausse de quantité après l'entrée en cuisine »), qui traitait
// le même bug par le seul côté HAUSSE. Ces cas restent valides et complètent
// les précédents ; le seul qu'elle affirmait — « une baisse ne restitue rien »
// — a été délibérément inversé : un article retiré d'une commande vivante n'a
// pas été consommé, le laisser décompté fait mentir le stock (cf. le test
// « REND au stock ce qui est retiré » plus haut).
describe('updateOrderItems — delta de stock, cas complémentaires', () => {
  const productItem = (overrides: Partial<CartItem> = {}): CartItem => ({
    cartId: 'c1',
    productId: 'p1',
    productName: 'Cappuccino',
    basePrice: 1500,
    coutMatiere: 0,
    coutEmballage: 0,
    quantity: 1,
    supplements: [],
    discount: 0,
    discountReason: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdate.mockResolvedValue({} as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  it('commande PAS encore réservée : aucun appel stock, juste items/total mis à jour', async () => {
    mockOrderFindUnique.mockResolvedValue({
      status: 'NEW',
      loyaltyDiscount: 0,
      items: [productItem({ quantity: 1 })],
      stockReservedAt: null,
    } as never);

    const result = await updateOrderItems('order1', [
      productItem({ quantity: 5 }),
    ]);

    expect(result).toEqual({ total: 7500 });
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: 7500 }),
      })
    );
  });

  it('un article tout juste ajouté décrémente sa quantité complète', async () => {
    mockOrderFindUnique.mockResolvedValue({
      status: 'PREPARING',
      loyaltyDiscount: 0,
      items: [productItem({ quantity: 1 })],
      stockReservedAt: new Date('2026-08-13T10:00:00Z'),
    } as never);

    await updateOrderItems('order1', [
      productItem({ quantity: 1 }),
      productItem({
        cartId: 'c2',
        productId: 'p2',
        productName: 'Croissant',
        basePrice: 800,
        quantity: 2,
        addedLater: true,
      }),
    ]);

    expect(mockProdUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockProdUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'p2' }),
        data: { stockQuantity: { decrement: 2 } },
      })
    );
  });

  it('le delta d’un supplément est décrémenté', async () => {
    const supplement = {
      groupName: 'Lait',
      optionName: 'Amande',
      price: 200,
      quantity: 1,
    };
    mockOrderFindUnique.mockResolvedValue({
      status: 'PREPARING',
      loyaltyDiscount: 0,
      items: [productItem({ quantity: 1, supplements: [supplement] })],
      stockReservedAt: new Date('2026-08-13T10:00:00Z'),
    } as never);

    await updateOrderItems('order1', [
      productItem({ quantity: 3, supplements: [supplement] }),
    ]);

    // Produit : 3 − 1 = 2. Supplément (besoin = quantité × qté de ligne) :
    // 1×3 − 1×1 = 2.
    expect(mockOptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'opt-active' }),
        data: { stockQuantity: { decrement: 2 } },
      })
    );
  });

  it('pénurie sur le delta : lève StockShortageError et n’écrit rien', async () => {
    mockOrderFindUnique.mockResolvedValue({
      status: 'PREPARING',
      loyaltyDiscount: 0,
      items: [productItem({ quantity: 1 })],
      stockReservedAt: new Date('2026-08-13T10:00:00Z'),
    } as never);
    mockProdUpdateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      updateOrderItems('order1', [productItem({ quantity: 3 })])
    ).rejects.toThrow(StockShortageError);
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it('refuse (409) sur une commande terminée', async () => {
    mockOrderFindUnique.mockResolvedValue({
      status: 'COMPLETED',
      loyaltyDiscount: 0,
      items: [productItem()],
      stockReservedAt: new Date('2026-08-13T10:00:00Z'),
    } as never);

    await expect(
      updateOrderItems('order1', [productItem({ quantity: 2 })])
    ).rejects.toThrow(OrderMutationError);
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
  });

  it('lève (404) si la commande est introuvable', async () => {
    mockOrderFindUnique.mockResolvedValue(null);

    await expect(updateOrderItems('order1', [productItem()])).rejects.toThrow(
      OrderMutationError
    );
  });
});

// ─── Fidélité à l'annulation par le staff ────────────────────────────────────
