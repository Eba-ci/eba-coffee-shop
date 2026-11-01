import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stock-history/record', async () =>
  (await import('@/lib/stock-history/test-mocks')).recordMock()
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
vi.mock('./credit', () => ({
  applyPaymentCredit: vi.fn(),
  releaseOrderCredit: vi.fn(),
  reapplyOrderCredit: vi.fn(),
}));

import { setOrderStatus } from '@/lib/order-mutations';
import { mockOrderFindUnique, mockOrderUpdateMany } from './test-utils';

const cancelled = (over: Record<string, unknown> = {}) => ({
  status: 'CANCELLED',
  dailyNumber: 3,
  customerId: null,
  isPaid: false,
  total: 3500,
  loyaltyRewardId: null,
  paymentExpiresAt: null,
  stockReservedAt: null,
  ...over,
});

describe('setOrderStatus — annulée servie sans décompte de stock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  it.each(['READY', 'COMPLETED'] as const)(
    'refuse CANCELLED → %s quand rien n’a été décompté (409)',
    async (target) => {
      mockOrderFindUnique.mockResolvedValue(cancelled() as never);
      await expect(setOrderStatus('o1', target, 'ADMIN')).rejects.toMatchObject(
        { httpStatus: 409 }
      );
      expect(mockOrderUpdateMany).not.toHaveBeenCalled();
    }
  );

  it('laisse passer quand le stock a déjà été décompté (annulée après lancement)', async () => {
    mockOrderFindUnique.mockResolvedValue(
      cancelled({ stockReservedAt: new Date('2026-11-01T08:00:00Z') }) as never
    );
    await setOrderStatus('o1', 'COMPLETED', 'ADMIN');
    expect(mockOrderUpdateMany).toHaveBeenCalled();
  });

  it('ne gêne pas les autres transitions (annulée → à encaisser)', async () => {
    mockOrderFindUnique.mockResolvedValue(cancelled() as never);
    await setOrderStatus('o1', 'NEW', 'ADMIN');
    expect(mockOrderUpdateMany).toHaveBeenCalled();
  });
});
