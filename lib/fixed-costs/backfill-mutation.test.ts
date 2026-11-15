import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    expenseCategory: { findFirst: vi.fn() },
    expense: { findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    fixedCost: { aggregate: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('@/lib/timezone', async (orig) => ({
  ...(await orig<typeof import('@/lib/timezone')>()),
  todayDateString: () => '2026-11-15',
}));

import { backfillFixedCost } from './backfill-mutation';

const input = {
  categoryId: 'cat',
  startDate: '2026-03-01',
  label: 'Loyer',
  amount: 150000,
};
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('backfillFixedCost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.expense.findFirst.mockResolvedValue({ date: utc('2026-03-05') });
    prismaMock.fixedCost.aggregate.mockResolvedValue({
      _max: { sortOrder: 1 },
    });
    prismaMock.fixedCost.create.mockResolvedValue({ id: 'new' });
  });

  it('crée la charge avec la clé d’idempotence, sans aucune dépense', async () => {
    prismaMock.expenseCategory.findFirst.mockResolvedValue({
      name: 'Loyer',
      fixedCosts: [],
    });
    const r = await backfillFixedCost(input);
    expect(r).toMatchObject({ action: 'created', costId: 'new' });
    expect(prismaMock.fixedCost.create.mock.calls[0][0].data).toMatchObject({
      importedCategoryId: 'cat',
      startDate: utc('2026-03-01'),
    });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
    expect(prismaMock.expense.createMany).not.toHaveBeenCalled();
  });

  it('corrige la prise d’effet d’une catégorie déjà convertie (pas de doublon)', async () => {
    prismaMock.expenseCategory.findFirst.mockResolvedValue({
      name: 'Loyer',
      fixedCosts: [
        {
          id: 'c1',
          startDate: utc('2026-10-01'),
          endDate: null,
          importedCategoryId: 'cat',
        },
      ],
    });
    const r = await backfillFixedCost(input);
    expect(r).toMatchObject({ action: 'updated', costId: 'c1' });
    expect(prismaMock.fixedCost.create).not.toHaveBeenCalled();
    expect(prismaMock.fixedCost.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { startDate: utc('2026-03-01') },
    });
  });

  it('rejouée à l’identique, ne change rien', async () => {
    prismaMock.expenseCategory.findFirst.mockResolvedValue({
      name: 'Loyer',
      fixedCosts: [
        {
          id: 'c1',
          startDate: utc('2026-03-01'),
          endDate: null,
          importedCategoryId: 'cat',
        },
      ],
    });
    const r = await backfillFixedCost(input);
    expect(r.action).toBe('unchanged');
    expect(prismaMock.fixedCost.update).not.toHaveBeenCalled();
    expect(prismaMock.fixedCost.create).not.toHaveBeenCalled();
  });

  it('refuse une catégorie portant plusieurs charges sans import', async () => {
    prismaMock.expenseCategory.findFirst.mockResolvedValue({
      name: 'Loyer',
      fixedCosts: [
        {
          id: 'a',
          startDate: utc('2026-01-01'),
          endDate: null,
          importedCategoryId: null,
        },
        {
          id: 'b',
          startDate: utc('2026-01-01'),
          endDate: null,
          importedCategoryId: null,
        },
      ],
    });
    await expect(backfillFixedCost(input)).rejects.toThrow(/plusieurs charges/);
  });

  it('refuse la catégorie Salaires, une date future et un montant nul', async () => {
    prismaMock.expenseCategory.findFirst.mockResolvedValue({
      name: 'Salaires',
      fixedCosts: [],
    });
    await expect(backfillFixedCost(input)).rejects.toThrow(/Employés/);
    prismaMock.expenseCategory.findFirst.mockResolvedValue({
      name: 'Loyer',
      fixedCosts: [],
    });
    await expect(
      backfillFixedCost({ ...input, startDate: '2027-01-01' })
    ).rejects.toThrow(/futur/);
    await expect(backfillFixedCost({ ...input, amount: 0 })).rejects.toThrow(
      /Montant/
    );
  });
});
