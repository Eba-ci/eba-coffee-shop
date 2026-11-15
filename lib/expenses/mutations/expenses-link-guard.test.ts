import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tx, prismaMock } = vi.hoisted(() => {
  const tx = {
    expense: { findUnique: vi.fn(), update: vi.fn() },
    expenseItem: { deleteMany: vi.fn() },
  };
  return {
    tx,
    prismaMock: {
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import { updateExpense } from './expenses';

const existing = (over = {}) => ({
  amount: 50_000,
  salaryAggregateKey: null,
  categoryId: 'loyer',
  fixedCostId: 'c1',
  _count: { items: 0 },
  ...over,
});

describe('updateExpense — dépense liée à une échéance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.expense.update.mockResolvedValue({ id: 'e1' });
  });

  it('refuse de changer la catégorie d’une dépense liée', async () => {
    tx.expense.findUnique.mockResolvedValue(existing());
    await expect(updateExpense('e1', { categoryId: 'autre' })).rejects.toThrow(
      /délie-la/
    );
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('autorise les autres modifications, et la même catégorie', async () => {
    tx.expense.findUnique.mockResolvedValue(existing());
    await updateExpense('e1', { note: 'ok', categoryId: 'loyer' });
    expect(tx.expense.update).toHaveBeenCalledTimes(1);
  });

  it('autorise le changement de catégorie d’une dépense libre', async () => {
    tx.expense.findUnique.mockResolvedValue(existing({ fixedCostId: null }));
    await updateExpense('e1', { categoryId: 'autre' });
    expect(tx.expense.update).toHaveBeenCalledTimes(1);
  });
});
