import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  (await import('@/lib/orders/mutations/test-mocks')).prismaModuleMock()
);
vi.mock('@/lib/push-notify', async () =>
  (await import('@/lib/orders/mutations/test-mocks')).pushNotifyModuleMock()
);

import prisma from '@/lib/prisma';
import { reserveStockOnce } from '@/lib/orders/mutations/stock-reservation';
import { holdKey } from './keys';
import { decrementResidualNeeds } from './consume';

const p = prisma as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;

const line = (productId: string, quantity: number, option?: string) => ({
  cartId: `c-${productId}`,
  productId,
  productName: productId,
  basePrice: 1000,
  coutMatiere: 0,
  coutEmballage: 0,
  quantity,
  supplements: option
    ? [{ groupName: 'Goûts', optionName: option, price: 0, quantity: 1 }]
    : [],
  discount: 0,
  discountReason: null,
});

describe('décompte au lancement avec des parts réservées', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.product.updateMany.mockResolvedValue({ count: 1 });
    p.supplementOption.updateMany.mockResolvedValue({ count: 1 });
    p.supplementOption.findFirst.mockResolvedValue({ id: 'vanille' });
    p.orderStockHold.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('ne décompte que le reste et supprime les réservations', async () => {
    const held = new Map([[holdKey('PRODUCT', 'gateau'), 1]]);

    await decrementResidualNeeds(
      prisma as never,
      'o1',
      [line('gateau', 1, 'Vanille')],
      held
    );

    // Le gâteau est déjà réservé : seule la vanille est décomptée.
    expect(p.product.updateMany).not.toHaveBeenCalled();
    expect(p.supplementOption.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'vanille',
        OR: [{ stockQuantity: null }, { stockQuantity: { gte: 1 } }],
      },
      data: { stockQuantity: { decrement: 1 } },
    });
    expect(p.orderStockHold.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
    });
  });

  it('refuse (409) si le reste n’est plus en stock', async () => {
    p.supplementOption.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      decrementResidualNeeds(
        prisma as never,
        'o1',
        [line('gateau', 1, 'Vanille')],
        new Map([[holdKey('PRODUCT', 'gateau'), 1]])
      )
    ).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('rend au stock une réservation excédentaire', async () => {
    await decrementResidualNeeds(
      prisma as never,
      'o1',
      [line('gateau', 1)],
      new Map([[holdKey('PRODUCT', 'gateau'), 3]])
    );

    expect(p.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'gateau' },
      data: { stockQuantity: { increment: 2 } },
    });
  });

  it('reserveStockOnce passe par le reste quand la commande porte des réservations', async () => {
    p.order.updateMany.mockResolvedValue({ count: 1 });
    p.orderStockHold.findMany.mockResolvedValue([
      { kind: 'PRODUCT', resourceId: 'gateau', quantity: 1 },
    ]);

    const claimed = await reserveStockOnce(prisma as never, 'o1', [
      line('gateau', 1),
    ]);

    expect(claimed).toBe(true);
    // Tout est déjà réservé : aucun décrément supplémentaire.
    expect(p.product.updateMany).not.toHaveBeenCalled();
    expect(p.orderStockHold.deleteMany).toHaveBeenCalled();
  });
});
