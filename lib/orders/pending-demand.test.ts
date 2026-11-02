import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', async () =>
  (await import('@/lib/orders/mutations/test-mocks')).prismaModuleMock()
);

import prisma from '@/lib/prisma';
import { getPendingDemand } from './pending-demand';

const p = prisma as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;

const line = (productId: string, option?: string) => ({
  cartId: `c-${productId}-${option ?? ''}`,
  productId,
  productName: productId,
  basePrice: 1000,
  coutMatiere: 0,
  coutEmballage: 0,
  quantity: 1,
  supplements: option
    ? [{ groupName: 'Goûts', optionName: option, price: 0, quantity: 1 }]
    : [],
  discount: 0,
  discountReason: null,
});

describe('getPendingDemand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.supplementOption.findMany.mockResolvedValue([
      {
        id: 'vanille',
        name: 'Vanille',
        group: { name: 'Goûts', productId: 'gateau', isGlobal: false },
      },
    ]);
  });

  it('compte tout ce que des commandes non lancées demandent', async () => {
    p.order.findMany.mockResolvedValue([
      { id: 'o1', items: [line('gateau', 'Vanille')] },
      { id: 'o2', items: [line('gateau', 'Vanille')] },
    ]);
    p.orderStockHold.findMany.mockResolvedValue([]);

    const res = await getPendingDemand();

    expect(res.products.get('gateau')).toBe(2);
    expect(res.options.get('vanille')).toBe(2);
  });

  it('ne recompte pas ce qui est déjà réservé (déjà sorti du stock)', async () => {
    p.order.findMany.mockResolvedValue([
      { id: 'o1', items: [line('gateau', 'Vanille')] },
      { id: 'o2', items: [line('gateau', 'Vanille')] },
    ]);
    // o1 a tout réservé ; o2 a réservé le produit mais pas encore la vanille.
    p.orderStockHold.findMany.mockResolvedValue([
      { orderId: 'o1', kind: 'PRODUCT', resourceId: 'gateau', quantity: 1 },
      { orderId: 'o1', kind: 'OPTION', resourceId: 'vanille', quantity: 1 },
      { orderId: 'o2', kind: 'PRODUCT', resourceId: 'gateau', quantity: 1 },
    ]);

    const res = await getPendingDemand();

    expect(res.products.has('gateau')).toBe(false);
    expect(res.options.get('vanille')).toBe(1);
  });
});
