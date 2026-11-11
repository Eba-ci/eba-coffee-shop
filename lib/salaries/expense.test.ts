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
  upsert?: ReturnType<typeof vi.fn>;
  aggregate?: ReturnType<typeof vi.fn>;
}) {
  return {
    expenseCategory: {
      upsert: overrides.upsert,
      aggregate: overrides.aggregate,
    },
  } as unknown as Prisma.TransactionClient;
}

describe('getSalaryCategoryId', () => {
  it('upsert la catégorie « Salaires » (concurrence sans P2002)', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'cat-1' });
    const id = await getSalaryCategoryId(
      fakeTx({
        aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 4 } }),
        upsert,
      })
    );
    expect(id).toBe('cat-1');
    expect(upsert).toHaveBeenCalledWith({
      where: { name: SALARY_EXPENSE_CATEGORY_NAME },
      create: {
        name: SALARY_EXPENSE_CATEGORY_NAME,
        nature: 'FIXED',
        sortOrder: 5,
      },
      // Une catégorie existante (même soft-delete) est reclassée FIXED.
      update: { deletedAt: null, nature: 'FIXED' },
    });
  });

  it('ne fait ni findUnique ni create (une seule requête atomique)', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'cat-1' });
    const tx = fakeTx({
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      upsert,
    }) as unknown as {
      expenseCategory: Record<string, unknown>;
    };
    await getSalaryCategoryId(tx as never);
    expect(upsert).toHaveBeenCalledOnce();
    expect('findUnique' in tx.expenseCategory).toBe(false);
    expect('create' in tx.expenseCategory).toBe(false);
  });
});
