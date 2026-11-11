// Tests du lien versement de salaire ↔ dépense : champs de la dépense miroir
// (aucun reçu, aucun nom d'employé) et résolution de la catégorie « Salaires ».

import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { SALARY_EXPENSE_CATEGORY_NAME } from '@/config/constants';
import { getSalaryCategoryId, salaryExpenseFields } from './expense';

describe('salaryExpenseFields', () => {
  it('ne porte aucun numéro de reçu (la séquence DEP reste continue)', () => {
    const fields = salaryExpenseFields({
      date: new Date(Date.UTC(2026, 5, 30)),
      amount: 250_000,
      paymentMethod: 'WAVE',
    });
    expect(fields.receiptNo).toBeNull();
    expect(fields.receiptPeriod).toBeNull();
    expect(fields.receiptSeq).toBeNull();
    expect(fields.paymentMethod).toBe('WAVE');
    expect(fields.amount).toBe(250_000);
  });

  it('ne porte aucun nom d’employé (ni note, ni fournisseur)', () => {
    const fields = salaryExpenseFields({
      date: new Date(Date.UTC(2026, 5, 30)),
      amount: 100_000,
      paymentMethod: 'CASH',
    });
    expect(fields.supplier).toBeNull();
    expect(fields.note).toBeNull();
  });
});

function fakeTx(overrides: {
  findUnique?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  aggregate?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
}) {
  return {
    expenseCategory: {
      findUnique: overrides.findUnique,
      update: overrides.update,
      aggregate: overrides.aggregate,
      create: overrides.create,
    },
  } as unknown as Prisma.TransactionClient;
}

describe('getSalaryCategoryId', () => {
  it('renvoie la catégorie existante sans la recréer', async () => {
    const create = vi.fn();
    const id = await getSalaryCategoryId(
      fakeTx({
        findUnique: vi.fn().mockResolvedValue({ id: 'cat-1', deletedAt: null }),
        create,
      })
    );
    expect(id).toBe('cat-1');
    expect(create).not.toHaveBeenCalled();
  });

  it('crée la catégorie « Salaires » en FIXED si elle manque', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'cat-new' });
    const id = await getSalaryCategoryId(
      fakeTx({
        findUnique: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 4 } }),
        create,
      })
    );
    expect(id).toBe('cat-new');
    expect(create).toHaveBeenCalledWith({
      data: {
        name: SALARY_EXPENSE_CATEGORY_NAME,
        nature: 'FIXED',
        sortOrder: 5,
      },
    });
  });

  it('ressuscite une catégorie soft-delete et la repasse en FIXED', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'cat-1' });
    const id = await getSalaryCategoryId(
      fakeTx({
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'cat-1', deletedAt: new Date() }),
        update,
      })
    );
    expect(id).toBe('cat-1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { deletedAt: null, nature: 'FIXED' },
    });
  });
});
