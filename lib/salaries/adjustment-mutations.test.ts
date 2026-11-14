// Écritures des primes / retenues (#443) : le contrôle « retenue ≤ dû des
// taux » utilise le calcul public (aucune règle dupliquée), et une annulation
// MARQUE la ligne sans la supprimer.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  default: { $transaction: vi.fn() },
}));

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import {
  cancelSalaryAdjustment,
  createSalaryAdjustment,
} from './adjustment-mutations';

const day = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));

function txMock(overrides: Record<string, unknown> = {}) {
  return {
    employee: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        startDate: day(2020, 1, 1),
        endDate: null,
        rates: [{ monthlyAmount: 300_000, startDate: day(2020, 1, 1) }],
        adjustments: [],
      }),
    },
    salaryAdjustment: {
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'a1', ...data })
        ),
      findUniqueOrThrow: vi.fn(),
      update: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'a1', canceledAt: null, ...data })
        ),
    },
    ...overrides,
  };
}

function withTransaction(tx: ReturnType<typeof txMock>) {
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (t: unknown) => unknown
  ) => fn(tx)) as never);
  return tx;
}

const input = {
  employeeId: 'e1',
  month: '2026-11',
  date: '2026-11-15',
  nature: 'RETENUE' as const,
  amount: 40_000,
  note: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN' },
  } as never);
});

describe('createSalaryAdjustment', () => {
  it('crée une retenue sous le dû des taux', async () => {
    const tx = withTransaction(txMock());
    await createSalaryAdjustment(input);
    expect(tx.salaryAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'e1',
        nature: 'RETENUE',
        amount: 40_000,
        createdById: 'admin-1',
      }),
    });
  });

  it('refuse une retenue qui rendrait le dû négatif', async () => {
    withTransaction(txMock());
    await expect(
      createSalaryAdjustment({ ...input, amount: 300_001 })
    ).rejects.toThrow(/retenue dépasse le salaire dû/i);
  });

  it('refuse une retenue cumulée qui dépasse le dû des taux', async () => {
    withTransaction(
      txMock({
        employee: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            startDate: day(2020, 1, 1),
            endDate: null,
            rates: [{ monthlyAmount: 300_000, startDate: day(2020, 1, 1) }],
            adjustments: [
              {
                month: '2026-11',
                nature: 'RETENUE',
                amount: 290_000,
                canceledAt: null,
              },
            ],
          }),
        },
      })
    );
    await expect(
      createSalaryAdjustment({ ...input, amount: 20_000 })
    ).rejects.toThrow(/retenue dépasse le salaire dû/i);
  });
});

describe('cancelSalaryAdjustment', () => {
  it('marque l’ajustement annulé sans le supprimer', async () => {
    const tx = withTransaction(txMock());
    tx.salaryAdjustment.findUniqueOrThrow.mockResolvedValue({
      id: 'a1',
      canceledAt: null,
    });
    await cancelSalaryAdjustment({ adjustmentId: 'a1' });
    expect(tx.salaryAdjustment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: { canceledAt: expect.any(Date) },
      })
    );
  });

  it('rejouer l’annulation conserve la date d’origine (idempotent)', async () => {
    const tx = withTransaction(txMock());
    const canceledAt = day(2026, 11, 20);
    tx.salaryAdjustment.findUniqueOrThrow.mockResolvedValue({
      id: 'a1',
      canceledAt,
    });
    await cancelSalaryAdjustment({ adjustmentId: 'a1' });
    expect(tx.salaryAdjustment.update).not.toHaveBeenCalled();
  });
});
