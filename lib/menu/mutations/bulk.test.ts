import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const update = vi.fn();
const count = vi.fn();
const catFindUnique = vi.fn();
const schedFindUnique = vi.fn();
const triggerRestockAlerts = vi.fn();

vi.mock('@/lib/stock-history/record', async () =>
  (await import('@/lib/stock-history/test-mocks')).recordMock()
);
vi.mock('@/lib/stock-history/lifecycle', async () =>
  (await import('@/lib/stock-history/test-mocks')).lifecycleMock()
);
vi.mock('@/lib/stock-history/lock', async () =>
  (await import('@/lib/stock-history/test-mocks')).lockMock()
);

vi.mock('@/lib/prisma', () => {
  const client = {
    product: {
      findMany: (a: unknown) => findMany(a),
      update: (a: unknown) => update(a),
      count: (a: unknown) => count(a),
    },
    menuCategory: { findUnique: (a: unknown) => catFindUnique(a) },
    productSchedule: { findUnique: (a: unknown) => schedFindUnique(a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return { default: client };
});
vi.mock('@/lib/restock-alerts', () => ({
  triggerRestockAlerts: () => triggerRestockAlerts(),
}));

import {
  bulkSetProductStock,
  bulkUpdateProducts,
  bulkUpdateProductsSchema,
} from './bulk';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `P-${id}`,
  categoryId: 'c1',
  price: 1000,
  available: true,
  featured: false,
  preorderable: false,
  advanceOrderDays: null,
  scheduleId: null,
  requiresDeposit: false,
  unavailableUntil: null,
  stockQuantity: null,
  ...over,
});

beforeEach(() => {
  for (const m of [
    findMany,
    update,
    count,
    catFindUnique,
    schedFindUnique,
    triggerRestockAlerts,
  ]) {
    m.mockReset();
  }
});

describe('bulkUpdateProductsSchema', () => {
  it('exige target+patch OU items, jamais les deux ni aucun', () => {
    const p = bulkUpdateProductsSchema;
    expect(p.safeParse({}).success).toBe(false);
    expect(
      p.safeParse({ target: { ids: ['a'] }, patch: { available: false } })
        .success
    ).toBe(true);
    expect(
      p.safeParse({
        target: { ids: ['a'] },
        patch: { available: false },
        items: [{ id: 'a', price: 1 }],
      }).success
    ).toBe(false);
  });

  it('refuse ids+categoryId ensemble, patch vide, doublons, champ inconnu et > plafond', () => {
    const p = bulkUpdateProductsSchema;
    const patch = { available: false };
    expect(
      p.safeParse({ target: { ids: ['a'], categoryId: 'c' }, patch }).success
    ).toBe(false);
    expect(p.safeParse({ target: { ids: ['a'] }, patch: {} }).success).toBe(
      false
    );
    expect(p.safeParse({ target: { ids: ['a', 'a'] }, patch }).success).toBe(
      false
    );
    expect(
      p.safeParse({ target: { ids: ['a'] }, patch: { name: 'x' } }).success
    ).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => `p${i}`);
    expect(p.safeParse({ target: { ids: many }, patch }).success).toBe(false);
  });
});

describe('bulkUpdateProducts', () => {
  it('applique un patch commun et ignore les produits déjà conformes', async () => {
    findMany.mockResolvedValue([row('a'), row('b', { available: false })]);
    const r = await bulkUpdateProducts({
      target: { ids: ['a', 'b'] },
      patch: { available: false },
    });
    expect(r).toMatchObject({ matched: 2, changed: 1, dryRun: false });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { available: false },
    });
  });

  it('refuse tout (rien d’écrit) si un id est inconnu', async () => {
    findMany.mockResolvedValue([row('a')]);
    await expect(
      bulkUpdateProducts({
        target: { ids: ['a', 'zzz'] },
        patch: { available: false },
      })
    ).rejects.toThrow(/zzz.*Rien n’a été modifié/);
    expect(update).not.toHaveBeenCalled();
  });

  it('dryRun renvoie l’avant/après sans rien écrire', async () => {
    findMany.mockResolvedValue([row('a')]);
    const r = await bulkUpdateProducts({
      dryRun: true,
      items: [{ id: 'a', price: 1500 }],
    });
    expect(r.results).toEqual([
      {
        id: 'a',
        name: 'P-a',
        changes: { price: { from: 1000, to: 1500 } },
      },
    ]);
    expect(update).not.toHaveBeenCalled();
  });

  it('cible toute une catégorie', async () => {
    findMany.mockResolvedValue([row('a'), row('b')]);
    await bulkUpdateProducts({
      target: { categoryId: 'c1' },
      patch: { featured: true },
    });
    expect(findMany.mock.calls[0][0].where).toEqual({
      categoryId: 'c1',
      deletedAt: null,
    });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('déplace en fin de catégorie cible (sortOrder consécutifs)', async () => {
    findMany.mockResolvedValue([row('a'), row('b')]);
    catFindUnique.mockResolvedValue({ deletedAt: null });
    count.mockResolvedValue(4);
    await bulkUpdateProducts({
      target: { ids: ['a', 'b'] },
      patch: { categoryId: 'c2' },
    });
    expect(count).toHaveBeenCalledTimes(1);
    expect(update.mock.calls.map(([a]) => a.data.sortOrder)).toEqual([4, 5]);
  });

  it('refuse une catégorie ou un planning cible inconnu avant d’écrire', async () => {
    findMany.mockResolvedValue([row('a')]);
    catFindUnique.mockResolvedValue(null);
    await expect(
      bulkUpdateProducts({ target: { ids: ['a'] }, patch: { categoryId: 'x' } })
    ).rejects.toThrow(/Catégorie cible introuvable/);
    schedFindUnique.mockResolvedValue(null);
    await expect(
      bulkUpdateProducts({ target: { ids: ['a'] }, patch: { scheduleId: 's' } })
    ).rejects.toThrow(/Planning cible introuvable/);
    expect(update).not.toHaveBeenCalled();
  });

  it('avertit quand un délai l’emporte sur « pas de précommande »', async () => {
    findMany.mockResolvedValue([row('a', { advanceOrderDays: 2 })]);
    const r = await bulkUpdateProducts({
      dryRun: true,
      target: { ids: ['a'] },
      patch: { preorderable: true },
    });
    expect(r.warnings).toEqual([]);
    findMany.mockResolvedValue([
      row('a', { advanceOrderDays: 2, preorderable: true }),
    ]);
    const w = await bulkUpdateProducts({
      dryRun: true,
      target: { ids: ['a'] },
      patch: { preorderable: false },
    });
    expect(w.warnings).toHaveLength(1);
  });

  it('relance les alertes de retour en stock seulement si une pause change', async () => {
    findMany.mockResolvedValue([row('a')]);
    await bulkUpdateProducts({
      target: { ids: ['a'] },
      patch: { available: false },
    });
    expect(triggerRestockAlerts).not.toHaveBeenCalled();
    await bulkUpdateProducts({
      target: { ids: ['a'] },
      patch: { unavailableUntil: '2026-10-22T08:00:00.000Z' },
    });
    expect(triggerRestockAlerts).toHaveBeenCalledTimes(1);
  });
});

describe('bulkSetProductStock', () => {
  it('pose des valeurs absolues, saute l’inchangé, alerte une seule fois', async () => {
    findMany.mockResolvedValue([
      row('a', { stockQuantity: 5 }),
      row('b', { stockQuantity: null }),
      row('c', { stockQuantity: 0 }),
    ]);
    const r = await bulkSetProductStock({
      items: [
        { id: 'a', quantity: 10 },
        { id: 'b', quantity: null },
        { id: 'c', quantity: 0 },
      ],
    });
    expect(r).toMatchObject({ matched: 3, changed: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { stockQuantity: 10 },
    });
    expect(triggerRestockAlerts).toHaveBeenCalledTimes(1);
  });

  it('dryRun n’écrit pas ; un id inconnu bloque tout', async () => {
    findMany.mockResolvedValue([row('a', { stockQuantity: 1 })]);
    await bulkSetProductStock({
      dryRun: true,
      items: [{ id: 'a', quantity: 2 }],
    });
    expect(update).not.toHaveBeenCalled();
    await expect(
      bulkSetProductStock({
        items: [
          { id: 'a', quantity: 2 },
          { id: 'zzz', quantity: 1 },
        ],
      })
    ).rejects.toThrow(/zzz/);
    expect(update).not.toHaveBeenCalled();
  });
});
