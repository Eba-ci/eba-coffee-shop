import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, create, update, deleteMany, updateMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    expenseCategory: { findMany, create, update, deleteMany, updateMany },
  },
}));

import { getFixedCostHistory } from './history-queries';

const expense = (month: number, day: number, amount: number) => ({
  date: new Date(Date.UTC(2026, month - 1, day)),
  amount,
});

describe('getFixedCostHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lit catégories et dépenses en UNE requête, sans écriture', async () => {
    findMany.mockResolvedValue([
      {
        id: 'loyer',
        name: 'Loyer',
        fixedCosts: [{ id: 'fc1' }],
        expenses: [expense(3, 5, 150_000), expense(4, 5, 150_000)],
      },
    ]);

    const rows = await getFixedCostHistory('2026-11');

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(rows).toEqual([
      expect.objectContaining({
        categoryId: 'loyer',
        categoryName: 'Loyer',
        firstMonth: '2026-03',
        lastMonth: '2026-04',
        alreadyConverted: true,
      }),
    ]);
  });

  it('n’exécute qu’une requête pour 30 catégories (pas de N+1)', async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({
        id: `cat-${i}`,
        name: `Catégorie ${i}`,
        fixedCosts: [],
        expenses: [expense(3, 1, 1_000 + i)],
      }))
    );

    const rows = await getFixedCostHistory('2026-11');

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(30);
  });

  it('filtre les catégories FIXED et exclut les lignes de salaire à la lecture', async () => {
    findMany.mockResolvedValue([]);

    await getFixedCostHistory('2026-11');

    const arg = findMany.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ nature: 'FIXED', deletedAt: null });
    expect(arg.select.expenses.where).toEqual({ salaryPaymentId: null });
  });
});
