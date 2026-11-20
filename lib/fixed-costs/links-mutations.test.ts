import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tx, prismaMock } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    fixedCost: { findMany: vi.fn() },
    expense: { findMany: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
    fixedCostLinkEvent: { create: vi.fn() },
  };
  return {
    tx,
    prismaMock: {
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('@/lib/timezone', async (orig) => ({
  ...(await orig<typeof import('@/lib/timezone')>()),
  todayDateString: () => '2026-11-15',
}));

import { linkExpenses, unlinkExpenses } from './links-mutations';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const cost = {
  id: 'c1',
  label: 'Loyer',
  amount: 50_000,
  periodicity: 'MONTHLY',
  startDate: utc('2026-03-10'),
  endDate: null,
  active: true,
  categoryId: 'cat',
  installments: [],
};
const exp = (over = {}) => ({
  id: 'e1',
  categoryId: 'cat',
  fixedCostId: null,
  dueDate: null,
  amount: 50_000,
  salaryAggregateKey: null,
  salaryPayments: [],
  ...over,
});
const actor = { userId: 'u1', source: 'STAFF' as const };
const target = { expenseId: 'e1', costId: 'c1', dueDate: '2026-03-10' };

describe('linkExpenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.fixedCost.findMany.mockResolvedValue([cost]);
    tx.expense.findMany.mockResolvedValue([exp()]);
    tx.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  });

  it('lie, trace l’action et passe l’échéance à payée', async () => {
    const [o] = await linkExpenses([target], actor);
    expect(o).toMatchObject({ result: 'linked', statusAfter: 'PAID' });
    expect(tx.expense.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { fixedCostId: 'c1', dueDate: utc('2026-03-10') },
    });
    expect(tx.fixedCostLinkEvent.create.mock.calls[0][0].data).toMatchObject({
      expenseId: 'e1',
      action: 'LINK',
      actorId: 'u1',
      source: 'STAFF',
    });
  });

  it('verrouille les charges puis les dépenses AVANT de lire les dépenses', async () => {
    await linkExpenses([target], actor);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const [costLock, expenseLock] = tx.$queryRaw.mock.calls.map((c) =>
      c[0].join('?')
    );
    expect(costLock).toContain('"fixed_cost"');
    expect(expenseLock).toContain('"expense"');
    expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.expense.findMany.mock.invocationCallOrder[0]
    );
  });

  it('deux appels qui visent la même dépense : le second la voit déjà liée ailleurs et refuse', async () => {
    await linkExpenses([target], actor);
    // Après le verrou, le second appel relit l'état validé du premier.
    tx.expense.findMany.mockResolvedValue([
      exp({ fixedCostId: 'c1', dueDate: utc('2026-03-10') }),
    ]);
    await expect(
      linkExpenses([{ ...target, dueDate: '2026-04-10' }], actor)
    ).rejects.toThrow(/déjà/);
    expect(tx.expense.update).toHaveBeenCalledTimes(1);
  });

  it('un montant inférieur donne « partielle » avec le cumul exact', async () => {
    tx.expense.findMany.mockResolvedValue([exp({ amount: 30_000 })]);
    const [o] = await linkExpenses([target], actor);
    expect(o).toMatchObject({ statusAfter: 'PARTIAL', paidAfter: 30_000 });
  });

  it('sans confirmation (dry-run), rien n’est écrit', async () => {
    const [o] = await linkExpenses([target], actor, { dryRun: true });
    expect(o.result).toBe('linked');
    expect(tx.expense.update).not.toHaveBeenCalled();
    expect(tx.fixedCostLinkEvent.create).not.toHaveBeenCalled();
  });

  it('refuse côté serveur une dépense d’une autre catégorie', async () => {
    tx.expense.findMany.mockResolvedValue([exp({ categoryId: 'autre' })]);
    await expect(linkExpenses([target], actor)).rejects.toThrow(
      /inter-catégories/
    );
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('refuse une dépense déjà liée ailleurs et une dépense de salaire', async () => {
    tx.expense.findMany.mockResolvedValue([
      exp({ fixedCostId: 'c1', dueDate: utc('2026-02-10') }),
    ]);
    await expect(linkExpenses([target], actor)).rejects.toThrow(/déjà/);
    tx.expense.findMany.mockResolvedValue([
      exp({ salaryAggregateKey: '2026-03-10:CASH' }),
    ]);
    await expect(linkExpenses([target], actor)).rejects.toThrow(/salaire/);
  });

  it('est rejouable : une liaison déjà en place n’écrit rien', async () => {
    tx.expense.findMany.mockResolvedValue([
      exp({ fixedCostId: 'c1', dueDate: utc('2026-03-10') }),
    ]);
    tx.expense.aggregate.mockResolvedValue({ _sum: { amount: 50_000 } });
    const [o] = await linkExpenses([target], actor);
    expect(o.result).toBe('already');
    expect(tx.expense.update).not.toHaveBeenCalled();
  });

  it('un lot est atomique : une erreur lève dans la transaction, avant toute écriture suivante', async () => {
    tx.expense.findMany.mockResolvedValue([
      exp(),
      exp({ id: 'e2', categoryId: 'x' }),
    ]);
    await expect(
      linkExpenses([target, { ...target, expenseId: 'e2' }], actor)
    ).rejects.toThrow();
    expect(tx.expense.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('refuse deux liaisons pour la même dépense', async () => {
    await expect(
      linkExpenses([target, { ...target, dueDate: '2026-04-10' }], actor)
    ).rejects.toThrow(/une seule échéance/);
  });
});

describe('unlinkExpenses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('délie, trace, et ignore une dépense déjà libre', async () => {
    tx.expense.findMany.mockResolvedValue([
      { id: 'e1', fixedCostId: 'c1', dueDate: utc('2026-03-10') },
      { id: 'e2', fixedCostId: null, dueDate: null },
    ]);
    const res = await unlinkExpenses(['e1', 'e2'], actor);
    expect(res.map((r) => r.result)).toEqual(['unlinked', 'already']);
    expect(tx.expense.update).toHaveBeenCalledTimes(1);
    expect(tx.expense.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { fixedCostId: null, dueDate: null },
    });
    expect(tx.fixedCostLinkEvent.create.mock.calls[0][0].data.action).toBe(
      'UNLINK'
    );
  });
});
