import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefundPrisma } from './test-utils';

const { prisma } = vi.hoisted(() => ({ prisma: {} as RefundPrisma }));
vi.mock('@/lib/stock-history/record', async () =>
  (await import('@/lib/stock-history/test-mocks')).recordMock()
);
vi.mock('@/lib/stock-history/lifecycle', async () =>
  (await import('@/lib/stock-history/test-mocks')).lifecycleMock()
);
vi.mock('@/lib/stock-history/lock', async () =>
  (await import('@/lib/stock-history/test-mocks')).lockMock()
);

vi.mock('@/lib/prisma', async () => {
  Object.assign(prisma, (await import('./test-utils')).refundPrismaMock());
  return { default: prisma };
});
vi.mock('@/lib/loyalty-mutations', () => ({ revokeLoyaltyForOrder: vi.fn() }));
vi.mock('@/lib/push-notify', () => ({ notifyOrderCustomer: vi.fn() }));
vi.mock('@/lib/revalidate-public-menu', () => ({
  revalidatePublicMenu: vi.fn(),
}));
vi.mock('@/lib/orders/mutations/stock-needs', () => ({
  resolveOptionId: vi.fn().mockResolvedValue('opt1'),
}));
vi.mock('@/lib/daily-numbering', () => ({
  todayDailyDate: () => new Date('2026-10-19T00:00:00Z'),
}));

import { revokeLoyaltyForOrder } from '@/lib/loyalty-mutations';
import { notifyOrderCustomer } from '@/lib/push-notify';
import { baseRefund } from './test-utils';
import { settleRefundPaid } from './on-paid';

const revoke = vi.mocked(revokeLoyaltyForOrder);

const full = {
  ...baseRefund,
  status: 'PAID',
  lines: [
    {
      productId: 'p1',
      kind: 'PRODUCT',
      groupName: null,
      optionName: null,
      quantity: 2,
    },
    {
      productId: 'p1',
      kind: 'SUPPLEMENT',
      groupName: 'Lait',
      optionName: 'Avoine',
      quantity: 2,
    },
  ],
  order: {
    customerId: 'cu1',
    loyaltyRewardId: 'rw1',
    stockReservedAt: new Date(),
  },
};

function given(
  over: Record<string, unknown> = {},
  paid = 1000,
  refunded = 1000
) {
  prisma.refund.findUnique.mockResolvedValue({ status: 'APPROVED' });
  prisma.refund.updateMany.mockResolvedValue({ count: 1 });
  prisma.refund.findUniqueOrThrow.mockResolvedValue({ ...full, ...over });
  prisma.orderPayment.aggregate.mockResolvedValue({ _sum: { amount: paid } });
  // 1er appel : plafond (actifs), 2e : remboursements PAID.
  prisma.refund.aggregate
    .mockResolvedValueOnce({ _sum: { amount: refunded } })
    .mockResolvedValueOnce({ _sum: { amount: refunded } });
}

const args = { id: 'r1', from: ['APPROVED' as const], actorId: 'admin1' };

describe('settleRefundPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('date l’effet comptable du jour où l’argent part, pas de la demande', async () => {
    given();
    await expect(settleRefundPaid(args)).resolves.toBe(true);
    expect(prisma.refund.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'APPROVED' },
      data: expect.objectContaining({
        status: 'PAID',
        payoutDate: new Date('2026-10-19T00:00:00Z'),
        paidAt: expect.any(Date),
      }),
    });
  });

  it('idempotent : déjà payé → rien ne se rejoue (ni tampon, ni stock, ni push)', async () => {
    prisma.refund.findUnique.mockResolvedValue({ status: 'PAID' });
    await expect(settleRefundPaid(args)).resolves.toBe(false);
    expect(revoke).not.toHaveBeenCalled();
    expect(notifyOrderCustomer).not.toHaveBeenCalled();
  });

  it('remboursement TOTAL : retire le tampon (la récompense utilisée reste consommée)', async () => {
    given();
    await settleRefundPaid(args);
    expect(revoke).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        orderId: 'o1',
        customerId: 'cu1',
        usedRewardId: 'rw1',
        keepUsedReward: true,
      })
    );
  });

  it('remboursement PARTIEL : le tampon reste', async () => {
    given({}, 1200, 1000);
    await settleRefundPaid(args);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('remboursement TOTAL : réveille les écrans caisse/cuisine (la commande sort des files)', async () => {
    given();
    await settleRefundPaid(args);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('remboursement PARTIEL : aucun réveil, la commande reste en file', async () => {
    given({}, 1200, 1000);
    await settleRefundPaid(args);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('commande sans client identifié : pas de tampon à retirer', async () => {
    given({ order: { ...full.order, customerId: null } });
    await settleRefundPaid(args);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('remise en stock cochée : recrédite le produit ET le supplément, une seule fois', async () => {
    given({ restockItems: true });
    await settleRefundPaid(args);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: { increment: 2 } },
    });
    expect(prisma.supplementOption.update).toHaveBeenCalledWith({
      where: { id: 'opt1' },
      data: { stockQuantity: { increment: 2 } },
    });
    expect(prisma.refund.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { stockRestoredAt: expect.any(Date) },
    });
  });

  it('remise en stock non cochée (défaut) : le stock n’est pas touché', async () => {
    given({ restockItems: false });
    await settleRefundPaid(args);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('stock jamais décompté (commande jamais réservée) ou déjà rendu : rien à recréditer', async () => {
    given({
      restockItems: true,
      order: { ...full.order, stockReservedAt: null },
    });
    await settleRefundPaid(args);
    expect(prisma.product.update).not.toHaveBeenCalled();

    given({ restockItems: true, stockRestoredAt: new Date() });
    await settleRefundPaid(args);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('remboursement automatique d’un paiement tardif : ni tampon ni stock', async () => {
    given({ source: 'AUTO_LATE', restockItems: true });
    await settleRefundPaid(args);
    expect(revoke).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('prévient le client une fois payé', async () => {
    given();
    await settleRefundPaid(args);
    expect(notifyOrderCustomer).toHaveBeenCalledWith(
      'o1',
      'REFUNDED',
      expect.stringContaining('1')
    );
  });

  it('note l’identifiant et les frais du transfert', async () => {
    given();
    await settleRefundPaid({ ...args, jekoTransferId: 'wth_9', feeFcfa: 12 });
    expect(prisma.refund.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'APPROVED' },
      data: expect.objectContaining({ jekoTransferId: 'wth_9', feeFcfa: 12 }),
    });
  });

  it('avoir : crédite le solde du client dans la même transaction, une ligne ISSUED', async () => {
    given({ delivery: 'STORE_CREDIT', channel: 'AVOIR' });
    prisma.$queryRaw.mockResolvedValue([{ creditBalance: 500 }]);
    await settleRefundPaid(args);
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'cu1' },
      data: { creditBalance: 1500 },
    });
    expect(prisma.customerCreditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'cu1',
        kind: 'ISSUED',
        delta: 1000,
        balanceAfter: 1500,
        refundId: 'r1',
      }),
    });
    expect(notifyOrderCustomer).toHaveBeenCalledWith(
      'o1',
      'REFUNDED',
      expect.stringContaining('avoir')
    );
  });

  it('remboursement en argent : le solde d’avoir n’est pas touché', async () => {
    given();
    await settleRefundPaid(args);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('avoir sans client sur la commande : la transaction échoue, rien n’est crédité', async () => {
    given({
      delivery: 'STORE_CREDIT',
      order: { ...full.order, customerId: null },
    });
    await expect(settleRefundPaid(args)).rejects.toThrow(/client/);
    expect(prisma.customerCreditEntry.create).not.toHaveBeenCalled();
  });
});
