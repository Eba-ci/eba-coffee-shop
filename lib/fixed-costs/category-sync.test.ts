import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    expenseCategory: { findMany: vi.fn() },
    expense: { findFirst: vi.fn() },
    fixedCost: { findMany: vi.fn(), aggregate: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import { syncFixedCostsFromCategories } from './category-sync';

describe('syncFixedCostsFromCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.fixedCost.aggregate.mockResolvedValue({
      _max: { sortOrder: 2 },
    });
    prismaMock.expenseCategory.findMany.mockResolvedValue([
      { id: 'a', name: 'Loyer' },
      { id: 'b', name: 'Internet' },
      { id: 's', name: 'Salaires' },
    ]);
    prismaMock.expense.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(where.categoryId === 'a' ? { amount: 150000 } : null)
    );
  });

  it('ne lit que les catégories FIXED non supprimées', async () => {
    prismaMock.fixedCost.findMany.mockResolvedValue([]);
    prismaMock.fixedCost.createMany.mockResolvedValue({ count: 1 });
    await syncFixedCostsFromCategories();
    expect(prismaMock.expenseCategory.findMany.mock.calls[0][0].where).toEqual({
      nature: 'FIXED',
      deletedAt: null,
    });
  });

  it('crée une charge liée par importedCategoryId, sans Salaires ni montant inventé', async () => {
    prismaMock.fixedCost.findMany.mockResolvedValue([]);
    prismaMock.fixedCost.createMany.mockResolvedValue({ count: 1 });
    const r = await syncFixedCostsFromCategories();
    const arg = prismaMock.fixedCost.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0]).toMatchObject({
      amount: 150000,
      periodicity: 'MONTHLY',
      categoryId: 'a',
      importedCategoryId: 'a',
      sortOrder: 3,
    });
    expect(r).toEqual({
      created: 1,
      toComplete: ['Internet'],
      skippedSalary: ['Salaires'],
      alreadyLinked: 0,
    });
  });

  it('second import : rien à créer', async () => {
    prismaMock.fixedCost.findMany.mockResolvedValue([
      { importedCategoryId: 'a' },
      { importedCategoryId: 'b' },
    ]);
    prismaMock.fixedCost.createMany.mockResolvedValue({ count: 0 });
    const r = await syncFixedCostsFromCategories();
    expect(prismaMock.fixedCost.createMany.mock.calls[0][0].data).toEqual([]);
    expect(r.created).toBe(0);
    expect(r.alreadyLinked).toBe(2);
  });
});
