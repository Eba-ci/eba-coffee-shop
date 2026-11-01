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

import prisma from '@/lib/prisma';
import { reserveForScheduledOrders } from './reserve';
import { releaseHolds, releaseStaleHolds } from './holds';

const p = prisma as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
> &
  Record<string, ReturnType<typeof vi.fn>>;

const item = (productId: string, quantity: number, option?: string) => ({
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

function orderRow(items: unknown[]) {
  return { status: 'NEW', isPaid: true, stockReservedAt: null, items };
}

describe('reserveForScheduledOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.order.findMany.mockResolvedValue([{ id: 'o1' }]);
    p.orderStockHold.findMany.mockResolvedValue([]);
    p.orderStockHold.upsert.mockResolvedValue({});
    p.product.updateMany.mockResolvedValue({ count: 1 });
    p.supplementOption.updateMany.mockResolvedValue({ count: 1 });
    p.$executeRaw.mockResolvedValue(1);
  });

  it('réserve le produit disponible, laisse le goût épuisé, et réveille les écrans', async () => {
    p.order.findUnique.mockResolvedValue(
      orderRow([item('gateau', 1, 'Vanille')])
    );
    p.supplementOption.findFirst.mockResolvedValue({ id: 'vanille' });
    p.product.findMany.mockResolvedValue([{ id: 'gateau', stockQuantity: 3 }]);
    p.supplementOption.findMany.mockResolvedValue([
      { id: 'vanille', stockQuantity: 0 },
    ]);

    const res = await reserveForScheduledOrders();

    expect(res).toEqual({ orders: 1, units: 1 });
    expect(p.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'gateau', stockQuantity: { gte: 1 } },
      data: { stockQuantity: { decrement: 1 } },
    });
    expect(p.supplementOption.updateMany).not.toHaveBeenCalled();
    expect(p.orderStockHold.upsert).toHaveBeenCalledTimes(1);
    expect(p.$executeRaw).toHaveBeenCalled();
  });

  it('ne retient rien si une vente concurrente a pris l’unité entre-temps', async () => {
    p.order.findUnique.mockResolvedValue(orderRow([item('gateau', 1)]));
    p.product.findMany.mockResolvedValue([{ id: 'gateau', stockQuantity: 1 }]);
    p.product.updateMany.mockResolvedValue({ count: 0 });

    const res = await reserveForScheduledOrders();

    expect(res.units).toBe(0);
    expect(p.orderStockHold.upsert).not.toHaveBeenCalled();
    expect(p.$executeRaw).not.toHaveBeenCalled();
  });

  it('ignore une commande déjà lancée ou plus payée au moment du verrou', async () => {
    p.order.findUnique.mockResolvedValue({
      ...orderRow([item('gateau', 1)]),
      stockReservedAt: new Date(),
    });

    const res = await reserveForScheduledOrders();

    expect(res.units).toBe(0);
    expect(p.product.updateMany).not.toHaveBeenCalled();
  });

  it('ne reprend pas la part déjà réservée', async () => {
    p.order.findUnique.mockResolvedValue(orderRow([item('gateau', 2)]));
    // 1er appel : balayage des réservations périmées (aucune) ; 2e : parts de la commande.
    p.orderStockHold.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { kind: 'PRODUCT', resourceId: 'gateau', quantity: 2 },
      ]);
    p.product.findMany.mockResolvedValue([{ id: 'gateau', stockQuantity: 9 }]);

    const res = await reserveForScheduledOrders();

    expect(res.units).toBe(0);
    expect(p.product.updateMany).not.toHaveBeenCalled();
  });
});

describe('releaseHolds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rend chaque part au stock puis supprime les lignes', async () => {
    p.orderStockHold.findMany.mockResolvedValue([
      { kind: 'PRODUCT', resourceId: 'gateau', quantity: 2 },
      { kind: 'OPTION', resourceId: 'choc', quantity: 1 },
    ]);
    p.product.updateMany.mockResolvedValue({ count: 1 });
    p.supplementOption.updateMany.mockResolvedValue({ count: 1 });
    p.orderStockHold.deleteMany.mockResolvedValue({ count: 2 });

    const units = await releaseHolds(prisma as never, 'o1');

    expect(units).toBe(3);
    expect(p.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'gateau' },
      data: { stockQuantity: { increment: 2 } },
    });
    expect(p.supplementOption.updateMany).toHaveBeenCalledWith({
      where: { id: 'choc' },
      data: { stockQuantity: { increment: 1 } },
    });
    expect(p.orderStockHold.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
    });
  });

  it('ne fait rien quand rien n’est réservé', async () => {
    p.orderStockHold.findMany.mockResolvedValue([]);
    expect(await releaseHolds(prisma as never, 'o1')).toBe(0);
    expect(p.product.updateMany).not.toHaveBeenCalled();
  });
});

describe('releaseStaleHolds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restitue les parts d’une commande sortie du dispositif', async () => {
    p.orderStockHold.findMany
      .mockResolvedValueOnce([{ orderId: 'o1' }])
      .mockResolvedValueOnce([
        { kind: 'PRODUCT', resourceId: 'gateau', quantity: 1 },
      ]);
    p.order.findUnique.mockResolvedValue({ stockReservedAt: null });
    p.product.updateMany.mockResolvedValue({ count: 1 });

    const units = await releaseStaleHolds(prisma as never, new Date());

    expect(units).toBe(1);
    expect(p.product.updateMany).toHaveBeenCalledTimes(1);
  });

  it('supprime sans recréditer les résidus d’une commande déjà lancée', async () => {
    p.orderStockHold.findMany.mockResolvedValueOnce([{ orderId: 'o1' }]);
    p.order.findUnique.mockResolvedValue({ stockReservedAt: new Date() });

    const units = await releaseStaleHolds(prisma as never, new Date());

    expect(units).toBe(0);
    expect(p.product.updateMany).not.toHaveBeenCalled();
    expect(p.orderStockHold.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
    });
  });
});
