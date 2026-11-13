// Une ligne de salaire est pilotée par le module salaires : les écritures
// génériques de dépense la refusent (sinon le versement lié se désynchronise).

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

describe('dépenses liées à un salaire', () => {
  it('updateExpense refuse de modifier une ligne de salaire', async () => {
    vi.mocked(prisma.$transaction).mockImplementation((async (
      fn: (tx: unknown) => unknown
    ) =>
      fn({
        expense: {
          findUnique: vi.fn().mockResolvedValue({
            amount: 100,
            salaryPaymentId: 'p1',
            _count: { items: 0 },
          }),
        },
      })) as never);

    await expect(updateExpense('x1', { note: 'x' })).rejects.toThrow(
      /versement de salaire/
    );
  });

  it('deleteExpense refuse de supprimer une ligne de salaire', async () => {
    vi.mocked(prisma.expense.findUnique).mockResolvedValue({
      salaryPaymentId: 'p1',
    } as never);

    await expect(deleteExpense('x1')).rejects.toThrow(/versement de salaire/);
  });
});
