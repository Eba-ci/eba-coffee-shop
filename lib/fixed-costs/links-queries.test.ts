import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, schedule } = vi.hoisted(() => ({
  prismaMock: { expense: { findMany: vi.fn() } },
  schedule: { getMonthSchedule: vi.fn(), listFixedCosts: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('./queries', () => ({
  ...schedule,
  getFixedCostSchedule: vi.fn(),
}));

import { getReconciliation, listUnlinkedFixedExpenses } from './links-queries';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const occ = {
  costId: 'c1',
  label: 'Loyer',
  categoryId: 'cat',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
  dueDate: '2026-03-10',
  amount: 50_000,
  paid: 0,
  remaining: 50_000,
  status: 'LATE',
  overdue: true,
  expenseIds: [],
};

describe('links-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schedule.listFixedCosts.mockResolvedValue([]);
  });

  it('ne lit que les dépenses libres hors salaire', async () => {
    prismaMock.expense.findMany.mockResolvedValue([]);
    await listUnlinkedFixedExpenses({
      from: '2026-03-01',
      to: '2026-03-31',
      categoryIds: ['cat'],
    });
    expect(prismaMock.expense.findMany.mock.calls[0][0].where).toMatchObject({
      fixedCostId: null,
      salaryAggregateKey: null,
      salaryPayments: { none: {} },
    });
  });

  it('exclut une catégorie nommée salaire', async () => {
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: 'e',
        date: utc('2026-03-12'),
        amount: 1,
        categoryId: 's',
        note: null,
        supplier: null,
        category: { name: 'Salaires' },
      },
    ]);
    expect(
      await listUnlinkedFixedExpenses({
        from: '2026-03-01',
        to: '2026-03-31',
        categoryIds: ['s'],
      })
    ).toEqual([]);
  });

  it('un mois = deux requêtes de dépenses, et des propositions', async () => {
    schedule.getMonthSchedule.mockResolvedValue([occ]);
    prismaMock.expense.findMany
      .mockResolvedValueOnce([
        {
          id: 'e1',
          date: utc('2026-03-15'),
          amount: 50_000,
          categoryId: 'cat',
          note: null,
          supplier: null,
          category: { name: 'Loyer' },
        },
      ])
      .mockResolvedValueOnce([]);
    const view = await getReconciliation('2026-03');
    expect(prismaMock.expense.findMany).toHaveBeenCalledTimes(2);
    expect(view.proposals).toHaveLength(1);
    expect(view.proposals[0]).toMatchObject({ expenseId: 'e1', delta: 0 });
  });

  it('lit l’échéancier en incluant les charges désactivées (rapprochement)', async () => {
    schedule.getMonthSchedule.mockResolvedValue([]);
    await getReconciliation('2026-03');
    expect(schedule.getMonthSchedule).toHaveBeenCalledWith(
      '2026-03',
      expect.anything(),
      { includeInactive: true }
    );
  });

  it('sans échéance, ne lit aucune dépense', async () => {
    schedule.getMonthSchedule.mockResolvedValue([]);
    const view = await getReconciliation('2026-03');
    expect(prismaMock.expense.findMany).not.toHaveBeenCalled();
    expect(view.proposals).toEqual([]);
  });
});
