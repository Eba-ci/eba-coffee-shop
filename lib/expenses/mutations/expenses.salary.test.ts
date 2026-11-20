// La ligne globale de masse salariale est recalculée par le module employés :
// les écritures génériques de dépense la refusent (sinon elle se désynchronise
// des versements).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    expense: { findUnique: vi.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { deleteExpense, updateExpense } from './expenses';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ligne globale de masse salariale', () => {
  it('updateExpense refuse de modifier la ligne globale', async () => {
    vi.mocked(prisma.$transaction).mockImplementation((async (
      fn: (tx: unknown) => unknown
    ) =>
      fn({
        expense: {
          findUnique: vi.fn().mockResolvedValue({
            amount: 100,
            salaryAggregateKey: '2026-11-01:WAVE',
            _count: { items: 0 },
          }),
        },
      })) as never);

    await expect(updateExpense('x1', { note: 'x' })).rejects.toThrow(
      /générée à partir des versements/
    );
  });

  it('deleteExpense refuse de supprimer la ligne globale', async () => {
    vi.mocked(prisma.expense.findUnique).mockResolvedValue({
      salaryAggregateKey: '2026-11-01:WAVE',
    } as never);

    await expect(deleteExpense('x1')).rejects.toThrow(
      /générée à partir des versements/
    );
  });
});
