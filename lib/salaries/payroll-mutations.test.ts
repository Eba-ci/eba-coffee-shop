// Paie de toute la masse salariale d'un mois : un versement par employé, une
// seule écriture, une seule synchronisation, borné par le reste à payer.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ default: { $transaction: vi.fn() } }));
vi.mock('./expense-sync', async (orig) => ({
  ...(await orig<typeof import('./expense-sync')>()),
  syncSalaryExpenses: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { syncSalaryExpenses } from './expense-sync';
import { settlePayroll } from './payroll-mutations';

const mk = (id: string) => ({
  id,
  name: `Employé ${id}`,
  startDate: new Date(Date.UTC(2026, 7, 1)),
  endDate: null,
  rates: [
    { monthlyAmount: 150_000, startDate: new Date(Date.UTC(2026, 7, 1)) },
  ],
  payments: [],
  adjustments: [],
});

function use() {
  const t = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    salaryPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    employee: { findMany: vi.fn().mockResolvedValue([mk('e1'), mk('e2')]) },
  };
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (x: unknown) => unknown
  ) => fn(t)) as never);
  return t;
}

const base = {
  month: '2026-10',
  date: '2026-11-01',
  idempotencyKey: 'paie-1',
  items: [
    { employeeId: 'e1', amount: 150_000 },
    { employeeId: 'e2', amount: 150_000 },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN' },
  } as never);
});

describe('settlePayroll', () => {
  it('crée un versement par employé avec une lecture, une écriture, une synchronisation', async () => {
    const t = use();
    const res = await settlePayroll(base, '2026-11-05');

    expect(res).toEqual({ created: 2, replayed: false });
    expect(t.employee.findMany).toHaveBeenCalledTimes(1);
    expect(t.salaryPayment.createMany).toHaveBeenCalledTimes(1);
    expect(t.salaryPayment.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(syncSalaryExpenses).toHaveBeenCalledTimes(1);
    expect(vi.mocked(syncSalaryExpenses).mock.calls[0][1]).toHaveLength(1);
  });

  it('refuse un montant supérieur au reste à payer', async () => {
    const t = use();
    await expect(
      settlePayroll(
        { ...base, items: [{ employeeId: 'e1', amount: 200_000 }] },
        '2026-11-05'
      )
    ).rejects.toThrow(/dépasse le reste à payer/);
    expect(t.salaryPayment.createMany).not.toHaveBeenCalled();
  });

  it('refuse deux fois le même employé dans un lot', async () => {
    use();
    await expect(
      settlePayroll(
        {
          ...base,
          items: [
            { employeeId: 'e1', amount: 1 },
            { employeeId: 'e1', amount: 2 },
          ],
        },
        '2026-11-05'
      )
    ).rejects.toThrow();
  });
});
