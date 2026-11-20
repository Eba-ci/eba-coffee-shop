// Synchronisation de la ligne globale de masse salariale. Contrat testé :
// - une ligne par (jour, mode), avec numéro de reçu et mention automatique ;
// - les versements du jour/mode sont rattachés (1:N) ;
// - une ligne dont la somme tombe à 0 est supprimée APRÈS le rattachement ;
// - pas de N+1 : le nombre de requêtes dépend du nombre de CLÉS distinctes,
//   jamais du nombre de versements.

import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { SALARY_AGGREGATE_NOTE } from './expense';
import { normalizeKeys, syncSalaryExpenses } from './expense-sync';

const nov1 = new Date(Date.UTC(2026, 10, 1));
const nov2 = new Date(Date.UTC(2026, 10, 2));

type Existing = { id: string; amount: number; salaryAggregateKey: string };

function fakeTx(opts: {
  existing?: Existing[];
  sums?: { date: Date; paymentMethod: string; amount: number }[];
  maxSeq?: number | null;
}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(opts.existing ?? []),
    salaryPayment: {
      groupBy: vi.fn().mockResolvedValue(
        (opts.sums ?? []).map((s) => ({
          date: s.date,
          paymentMethod: s.paymentMethod,
          _sum: { amount: s.amount },
        }))
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    expense: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _max: { receiptSeq: opts.maxSeq ?? null } }),
      create: vi.fn().mockResolvedValue({ id: 'new-line' }),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    expenseCategory: {
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      upsert: vi.fn().mockResolvedValue({ id: 'cat-sal' }),
    },
  };
  return tx;
}
const asTx = (t: ReturnType<typeof fakeTx>) =>
  t as unknown as Prisma.TransactionClient;

describe('normalizeKeys', () => {
  it('dédoublonne et ordonne (ordre de verrouillage stable)', () => {
    const keys = normalizeKeys([
      { date: nov2, paymentMethod: 'WAVE' },
      { date: nov1, paymentMethod: 'WAVE' },
      { date: nov1, paymentMethod: 'WAVE' },
    ]);
    expect(keys.map((k) => k.date)).toEqual([nov1, nov2]);
  });
});

describe('syncSalaryExpenses', () => {
  it('crée la ligne globale avec reçu normal et mention automatique', async () => {
    const tx = fakeTx({
      sums: [{ date: nov1, paymentMethod: 'WAVE', amount: 450_000 }],
      maxSeq: 7,
    });

    await syncSalaryExpenses(
      asTx(tx),
      [{ date: nov1, paymentMethod: 'WAVE' }],
      'admin-1'
    );

    expect(tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 450_000,
        categoryId: 'cat-sal',
        note: SALARY_AGGREGATE_NOTE,
        salaryAggregateKey: '2026-11-01:WAVE',
        receiptPeriod: '2026-11',
        receiptSeq: 8,
        receiptNo: 'DEP-2026-11-0008',
        createdById: 'admin-1',
      }),
      select: { id: true },
    });
    expect(tx.salaryPayment.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ date: nov1, paymentMethod: 'WAVE' }),
      data: { expenseId: 'new-line' },
    });
  });

  it('met à jour le montant seulement s’il a changé (reçu immuable)', async () => {
    const same = fakeTx({
      existing: [
        { id: 'l1', amount: 450_000, salaryAggregateKey: '2026-11-01:WAVE' },
      ],
      sums: [{ date: nov1, paymentMethod: 'WAVE', amount: 450_000 }],
    });
    await syncSalaryExpenses(
      asTx(same),
      [{ date: nov1, paymentMethod: 'WAVE' }],
      null
    );
    expect(same.expense.update).not.toHaveBeenCalled();
    expect(same.expense.create).not.toHaveBeenCalled();

    const changed = fakeTx({
      existing: [
        { id: 'l1', amount: 450_000, salaryAggregateKey: '2026-11-01:WAVE' },
      ],
      sums: [{ date: nov1, paymentMethod: 'WAVE', amount: 600_000 }],
    });
    await syncSalaryExpenses(
      asTx(changed),
      [{ date: nov1, paymentMethod: 'WAVE' }],
      null
    );
    expect(changed.expense.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { amount: 600_000 },
    });
    expect(changed.expense.create).not.toHaveBeenCalled();
  });

  it('supprime la ligne dont la somme tombe à 0, après avoir rattaché les déplacés', async () => {
    // Un versement passe du 1er au 2 novembre : le 1er est vide, le 2 gagne.
    const tx = fakeTx({
      existing: [
        { id: 'old', amount: 100_000, salaryAggregateKey: '2026-11-01:WAVE' },
      ],
      sums: [{ date: nov2, paymentMethod: 'WAVE', amount: 100_000 }],
    });

    await syncSalaryExpenses(
      asTx(tx),
      [
        { date: nov1, paymentMethod: 'WAVE' },
        { date: nov2, paymentMethod: 'WAVE' },
      ],
      null
    );

    expect(tx.expense.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old'] } },
    });
    const link = tx.salaryPayment.updateMany.mock.invocationCallOrder[0];
    const del = tx.expense.deleteMany.mock.invocationCallOrder[0];
    expect(link).toBeLessThan(del);
  });

  it('n’écrit rien quand il n’y a aucune clé', async () => {
    const tx = fakeTx({});
    await syncSalaryExpenses(asTx(tx), [], null);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('pas de N+1 : 12 mois réglés le même jour = mêmes requêtes qu’un seul', async () => {
    // 12 versements (un par mois couvert) tombent sur UNE clé (1er novembre,
    // Wave) : le coût ne dépend pas de leur nombre.
    const keys = Array.from({ length: 12 }, () => ({
      date: nov1,
      paymentMethod: 'WAVE' as const,
    }));
    const tx = fakeTx({
      sums: [{ date: nov1, paymentMethod: 'WAVE', amount: 1_800_000 }],
    });

    await syncSalaryExpenses(asTx(tx), keys, 'admin-1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.salaryPayment.groupBy).toHaveBeenCalledTimes(1);
    expect(tx.expense.create).toHaveBeenCalledTimes(1);
    expect(tx.salaryPayment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.expenseCategory.upsert).toHaveBeenCalledTimes(1);
  });

  it('plusieurs clés : une lecture groupée, une écriture par clé', async () => {
    const tx = fakeTx({
      sums: [
        { date: nov1, paymentMethod: 'WAVE', amount: 300_000 },
        { date: nov2, paymentMethod: 'CASH', amount: 50_000 },
      ],
    });

    await syncSalaryExpenses(
      asTx(tx),
      [
        { date: nov1, paymentMethod: 'WAVE' },
        { date: nov2, paymentMethod: 'CASH' },
      ],
      null
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.salaryPayment.groupBy).toHaveBeenCalledTimes(1);
    expect(tx.expense.create).toHaveBeenCalledTimes(2);
    expect(tx.salaryPayment.updateMany).toHaveBeenCalledTimes(2);
  });
});
