import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/lib/push-notify', () => ({ notifyOrderCustomer: vi.fn() }));
vi.mock('@/lib/orders/availability', () => ({
  fetchStockSnapshot: vi.fn(),
  optionKey: vi.fn(),
}));
vi.mock('./stock-locks', () => ({ lockStockForOrder: vi.fn() }));
vi.mock('./stock-needs', () => ({ decrementStockForOrderItems: vi.fn() }));
vi.mock('@/lib/orders/stock-holds/consume', () => ({
  decrementResidualNeeds: vi.fn(),
}));
vi.mock('@/lib/orders/stock-holds/holds', () => ({
  loadHolds: vi.fn(async () => new Map()),
}));

import type { Prisma } from '@/generated/prisma/client';
import type { CartItem } from '@/lib/cart-store';
import { reserveStockOnce } from './stock-reservation';
import { lockStockForOrder } from './stock-locks';
import { decrementStockForOrderItems } from './stock-needs';

const line = (productId: string, quantity: number) =>
  ({
    productId,
    productName: productId,
    quantity,
    supplements: [],
  }) as CartItem;

function makeTx(claimed: number, stored: CartItem[] | null) {
  return {
    order: {
      updateMany: vi.fn(async () => ({ count: claimed })),
      findUnique: vi.fn(async () => (stored ? { items: stored } : null)),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('reserveStockOnce — le contenu fait foi sous verrou', () => {
  beforeEach(() => vi.clearAllMocks());

  it('décompte le contenu RELU après le claim, pas celui lu avant la transaction', async () => {
    const stale = [line('A', 2), line('B', 1)];
    const fresh = [line('A', 1), line('B', 3)];
    const tx = makeTx(1, fresh);
    await reserveStockOnce(tx, 'o1', stale);
    expect(decrementStockForOrderItems).toHaveBeenCalledWith(
      tx,
      fresh,
      expect.anything()
    );
    expect(lockStockForOrder).toHaveBeenCalledWith(
      tx,
      'o1',
      [fresh],
      new Map()
    );
  });

  it('repli sur les articles fournis si la relecture ne renvoie rien', async () => {
    const passed = [line('A', 2)];
    const tx = makeTx(1, null);
    await reserveStockOnce(tx, 'o1', passed);
    expect(decrementStockForOrderItems).toHaveBeenCalledWith(
      tx,
      passed,
      expect.anything()
    );
  });

  it('commande déjà réservée : aucun verrou, aucune relecture, aucun décompte', async () => {
    const tx = makeTx(0, [line('A', 1)]);
    expect(await reserveStockOnce(tx, 'o1', [line('A', 1)])).toBe(false);
    expect(tx.order.findUnique).not.toHaveBeenCalled();
    expect(lockStockForOrder).not.toHaveBeenCalled();
    expect(decrementStockForOrderItems).not.toHaveBeenCalled();
  });
});
