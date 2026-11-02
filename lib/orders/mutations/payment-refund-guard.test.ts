import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    order: { findUnique: vi.fn(), updateMany: vi.fn() },
    orderPayment: { deleteMany: vi.fn() },
    refund: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/push-notify', () => ({ notifyOrderCustomer: vi.fn() }));
vi.mock('./credit', () => ({
  applyPaymentCredit: vi.fn(),
  releaseOrderCredit: vi.fn(),
}));

import prisma from '@/lib/prisma';
import { setOrderPayment } from './payment';
import { releaseOrderCredit } from './credit';

const count = vi.mocked(prisma.refund.count);

describe('dépaiement et remboursements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      isPaid: true,
    } as never);
    // Transaction interactive : rejoue le callback sur un client factice.
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      orderPayment: { deleteMany: vi.fn() },
      // Dépaiement : les réservations de stock sont rendues (aucune ici).
      orderStockHold: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((async (
      fn: (t: unknown) => unknown
    ) => fn(tx)) as never);
  });

  it('refuse de remettre à encaisser une commande déjà (en cours de) remboursée', async () => {
    count.mockResolvedValue(1);
    await expect(setOrderPayment('o1', false)).rejects.toMatchObject({
      httpStatus: 409,
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        orderId: 'o1',
        status: { in: ['PAID', 'PROCESSING', 'UNCERTAIN'] },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sans remboursement : le dépaiement se fait comme avant', async () => {
    count.mockResolvedValue(0);
    await expect(setOrderPayment('o1', false)).resolves.toEqual({
      startedPreparation: false,
    });
  });

  it('le dépaiement rend à son client l’avoir dépensé sur la commande', async () => {
    count.mockResolvedValue(0);
    await setOrderPayment('o1', false, undefined, 'u1');
    expect(releaseOrderCredit).toHaveBeenCalledWith(
      expect.anything(),
      'o1',
      'u1'
    );
  });
});
