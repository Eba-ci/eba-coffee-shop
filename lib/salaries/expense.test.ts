// Tests de la ligne globale de masse salariale : champs (mention automatique,
// aucun nom d'employé) et résolution de la catégorie « Salaires ».

import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { SALARY_EXPENSE_CATEGORY_NAME } from '@/config/constants';
import {
  SALARY_AGGREGATE_NOTE,
  getSalaryCategoryId,
  salaryAggregateFields,
  salaryAggregateKey,
} from './expense';

describe('salaryAggregateFields', () => {
  const day = new Date(Date.UTC(2026, 10, 1));

  it('porte la mention automatique et la clé jour:mode', () => {
    const f = salaryAggregateFields(day, 'WAVE', 450_000);
    expect(f.note).toBe(SALARY_AGGREGATE_NOTE);
    expect(f.salaryAggregateKey).toBe('2026-11-01:WAVE');
    expect(f.amount).toBe(450_000);
    expect(f.paymentMethod).toBe('WAVE');
  });

  it('ne porte aucun nom d’employé ni fournisseur ni justificatif', () => {
    const f = salaryAggregateFields(day, 'CASH', 100_000);
    expect(f.supplier).toBeNull();
    expect(f.receiptUrl).toBeNull();
    expect(JSON.stringify(f)).not.toMatch(/employ/i);
  });

  it('la clé distingue le jour et le mode', () => {
    expect(salaryAggregateKey(day, 'WAVE')).not.toBe(
      salaryAggregateKey(day, 'CASH')
    );
    expect(salaryAggregateKey(day, 'WAVE')).not.toBe(
      salaryAggregateKey(new Date(Date.UTC(2026, 10, 2)), 'WAVE')
    );
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
