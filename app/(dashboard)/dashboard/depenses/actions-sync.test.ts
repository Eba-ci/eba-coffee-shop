import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sync, requireFinance } = vi.hoisted(() => ({
  sync: vi.fn(),
  requireFinance: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({ requireFinance }));
vi.mock('@/lib/fixed-costs/category-sync', () => ({
  syncFixedCostsFromCategories: sync,
}));
vi.mock('@/lib/fixed-costs/mutations', () => ({}));
vi.mock('@/lib/expense-mutations', () => ({}));
vi.mock('@/lib/recurring-expense-mutations', () => ({}));
vi.mock('@/lib/inventory-mutations', () => ({}));
vi.mock('@/lib/expense-settings-db', () => ({}));

import { syncFixedCostsFromCategoriesAction } from './actions';

describe('syncFixedCostsFromCategoriesAction : droits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuse sans droit finance (ex. ANALYSTE) : rien n’atteint la base', async () => {
    requireFinance.mockRejectedValue(new Error('Non autorisé'));
    await expect(syncFixedCostsFromCategoriesAction()).rejects.toThrow(
      'Non autorisé'
    );
    expect(sync).not.toHaveBeenCalled();
  });

  it('exécute l’import avec un rôle finance', async () => {
    requireFinance.mockResolvedValue({ user: { id: 'u' } });
    sync.mockResolvedValue({
      created: 1,
      toComplete: [],
      skippedSalary: [],
      alreadyLinked: 0,
    });
    const r = await syncFixedCostsFromCategoriesAction();
    expect(r).toMatchObject({ ok: true, created: 1 });
  });
});
