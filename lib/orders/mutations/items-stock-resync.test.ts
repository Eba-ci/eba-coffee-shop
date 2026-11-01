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

import { updateOrderItems } from '@/lib/order-mutations';
import type { CartItem } from '@/lib/cart-store';
import {
  mockOrderFindUnique,
  mockOrderUpdate,
  mockProdUpdateMany,
  mockOptionFindFirst,
  mockOptionUpdateMany,
  mockProdUpdate,
  mockOptionUpdate,
} from './test-utils';

describe('updateOrderItems — resynchronisation du stock', () => {
  const line = (quantity: number, optionQuantity = 3) => ({
    cartId: 'c1',
    productId: 'p1',
    productName: 'Tartelettes x3',
    basePrice: 2500,
    coutMatiere: 0,
    coutEmballage: 0,
    quantity,
    supplements: [
      {
        groupName: 'Choisissez vos goûts',
        optionName: 'Cacahuète vanille',
        price: 0,
        quantity: optionQuantity,
      },
    ],
    discount: 0,
    discountReason: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-1' } as never);
    mockOrderUpdate.mockResolvedValue({} as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockProdUpdate.mockResolvedValue({} as never);
    mockOptionUpdate.mockResolvedValue({} as never);
  });

  it('ne touche à rien tant que la commande n’a pas réservé', async () => {
    mockOrderFindUnique.mockResolvedValue({
      status: 'NEW',
      loyaltyDiscount: null,
      stockReservedAt: null,
      items: [line(1)],
    } as never);

    await updateOrderItems('order1', [line(3)] as CartItem[]);

    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockProdUpdate).not.toHaveBeenCalled();
  });

  it('décompte le delta AJOUTÉ sur une commande déjà en cuisine', async () => {
    mockOrderFindUnique.mockResolvedValue({
      status: 'PREPARING',
      loyaltyDiscount: null,
      stockReservedAt: new Date(),
      items: [line(1)],
    } as never);

    await updateOrderItems('order1', [line(3)] as CartItem[]);

    // 3 − 1 = 2 unités de plus, et 9 − 3 = 6 goûts de plus.
    expect(mockProdUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stockQuantity: { decrement: 2 } },
      })
    );
    expect(mockOptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stockQuantity: { decrement: 6 } },
      })
    );
  });

  it('REND au stock ce qui est retiré — un article non consommé doit redevenir vendable', async () => {
    mockOrderFindUnique.mockResolvedValue({
      status: 'PREPARING',
      loyaltyDiscount: null,
      stockReservedAt: new Date(),
      items: [line(3)],
    } as never);

    await updateOrderItems('order1', [line(1)] as CartItem[]);

    expect(mockProdUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: { increment: 2 } },
    });
    expect(mockOptionUpdate).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: { stockQuantity: { increment: 6 } },
    });
  });

  it('ne rend rien si le staff indique que l’article était déjà préparé', async () => {
    mockOrderFindUnique.mockResolvedValue({
      status: 'PREPARING',
      loyaltyDiscount: null,
      stockReservedAt: new Date(),
      items: [line(3)],
    } as never);

    await updateOrderItems('order1', [line(1)] as CartItem[], {
      restoreRemovedStock: false,
    });

    expect(mockProdUpdate).not.toHaveBeenCalled();
    expect(mockOptionUpdate).not.toHaveBeenCalled();
  });

  it('rejouer la même modification ne crédite pas deux fois (delta calculé sur l’état persisté)', async () => {
    // Deuxième appel : les articles persistés sont DÉJÀ ceux qu'on envoie.
    mockOrderFindUnique.mockResolvedValue({
      status: 'PREPARING',
      loyaltyDiscount: null,
      stockReservedAt: new Date(),
      items: [line(1)],
    } as never);

    await updateOrderItems('order1', [line(1)] as CartItem[]);

    expect(mockProdUpdate).not.toHaveBeenCalled();
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
  });
});
