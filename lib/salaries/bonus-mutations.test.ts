import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ default: { $transaction: vi.fn() } }));

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { convertOverpaymentToBonus } from './bonus-mutations';

function tx(paid: number) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    employee: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        startDate: new Date(Date.UTC(2026, 9, 1)),
        endDate: null,
        rates: [
          { monthlyAmount: 100_000, startDate: new Date(Date.UTC(2026, 9, 1)) },
        ],
        payments: [
          {
            month: '2026-10',
            type: 'SALAIRE',
            amount: paid,
            recoveryMonths: 1,
          },
        ],
        adjustments: [],
      }),
    },
    salaryAdjustment: { create: vi.fn().mockResolvedValue({}) },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN' },
  } as never);
});

function use(t: ReturnType<typeof tx>) {
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (x: unknown) => unknown
  ) => fn(t)) as never);
  return t;
}

describe('convertOverpaymentToBonus', () => {
  it('crée une prime du montant du trop-perçu', async () => {
    const t = use(tx(130_000));
    const r = await convertOverpaymentToBonus(
      { employeeId: 'e1', month: '2026-10' },
      '2026-11-05'
    );
    expect(r).toEqual({ created: true, amount: 30_000 });
    expect(t.salaryAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nature: 'PRIME',
        amount: 30_000,
        month: '2026-10',
      }),
    });
  });

  it('sans trop-perçu : no-op (idempotent)', async () => {
    const t = use(tx(100_000));
    const r = await convertOverpaymentToBonus(
      { employeeId: 'e1', month: '2026-10' },
      '2026-11-05'
    );
    expect(r).toEqual({ created: false, amount: 0 });
    expect(t.salaryAdjustment.create).not.toHaveBeenCalled();
  });
});
