// Règlement d'arriéré par lot : atomique, idempotent, borné par le reste à
// payer, et sans N+1 (une seule synchronisation pour tout le lot).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ default: { $transaction: vi.fn() } }));
vi.mock('./expense-sync', async (orig) => ({
  ...(await orig<typeof import('./expense-sync')>()),
  syncSalaryExpenses: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { SalaryIdempotencyConflictError } from './errors';
import { syncSalaryExpenses } from './expense-sync';
import { settleSalaryMonths } from './settle-mutations';

const employee = {
  startDate: new Date(Date.UTC(2026, 7, 1)), // août 2026
  endDate: null,
  rates: [
    { monthlyAmount: 150_000, startDate: new Date(Date.UTC(2026, 7, 1)) },
  ],
  payments: [],
  adjustments: [],
};

function tx(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    salaryPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    employee: { findUniqueOrThrow: vi.fn().mockResolvedValue(employee) },
    ...overrides,
  };
}

const base = {
  employeeId: 'e1',
  idempotencyKey: 'lot-1',
  items: [
    { month: '2026-09', date: '2026-10-01', amount: 150_000 },
    { month: '2026-10', date: '2026-11-01', amount: 150_000 },
  ],
};

function use(t: ReturnType<typeof tx>) {
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (x: unknown) => unknown
  ) => fn(t)) as never);
  return t;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN' },
  } as never);
});

describe('settleSalaryMonths', () => {
  it('crée un versement par mois en UNE écriture et UNE synchronisation', async () => {
    const t = use(tx());

    const res = await settleSalaryMonths(base, '2026-11-05');

    expect(res).toEqual({ created: 2, replayed: false });
    expect(t.salaryPayment.createMany).toHaveBeenCalledTimes(1);
    expect(t.salaryPayment.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(t.employee.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(syncSalaryExpenses).toHaveBeenCalledTimes(1);
    expect(vi.mocked(syncSalaryExpenses).mock.calls[0][1]).toHaveLength(2);
  });

  it('refuse un montant supérieur au reste à payer du mois', async () => {
    const t = use(tx());
    await expect(
      settleSalaryMonths(
        {
          ...base,
          items: [{ month: '2026-09', date: '2026-10-01', amount: 200_000 }],
        },
        '2026-11-05'
      )
    ).rejects.toThrow(/dépasse le reste à payer/);
    expect(t.salaryPayment.createMany).not.toHaveBeenCalled();
    expect(syncSalaryExpenses).not.toHaveBeenCalled();
  });

  it('rejeu identique : renvoie le lot sans rien écrire', async () => {
    const t = use(
      tx({
        salaryPayment: {
          findMany: vi.fn().mockResolvedValue([
            {
              employeeId: 'e1',
              idempotencyKey: 'lot-1:2026-09',
              month: '2026-09',
              amount: 150_000,
              date: new Date(Date.UTC(2026, 9, 1)),
            },
            {
              employeeId: 'e1',
              idempotencyKey: 'lot-1:2026-10',
              month: '2026-10',
              amount: 150_000,
              date: new Date(Date.UTC(2026, 10, 1)),
            },
          ]),
          createMany: vi.fn(),
        },
      })
    );

    await expect(settleSalaryMonths(base, '2026-11-05')).resolves.toEqual({
      created: 0,
      replayed: true,
    });
    expect(t.salaryPayment.createMany).not.toHaveBeenCalled();
  });

  it('rejeu avec un contenu différent : conflit', async () => {
    use(
      tx({
        salaryPayment: {
          findMany: vi.fn().mockResolvedValue([
            {
              employeeId: 'e1',
              idempotencyKey: 'lot-1:2026-09',
              month: '2026-09',
              amount: 1,
              date: new Date(Date.UTC(2026, 9, 1)),
            },
          ]),
          createMany: vi.fn(),
        },
      })
    );
    await expect(settleSalaryMonths(base, '2026-11-05')).rejects.toBeInstanceOf(
      SalaryIdempotencyConflictError
    );
  });

  it('refuse un lot qui répète un mois', async () => {
    await expect(
      settleSalaryMonths({
        ...base,
        items: [base.items[0], base.items[0]],
      })
    ).rejects.toThrow();
  });
});
