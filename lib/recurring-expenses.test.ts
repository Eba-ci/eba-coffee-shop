// Le contrôle « récurrente non saisie » ne doit pas être éteint par une ligne
// de salaire : on exclut les dépenses liées à un versement (`salaryPaymentId`).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    recurringExpense: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { getMissingRecurringExpenses } from './recurring-expenses';

const template = {
  id: 't1',
  label: 'Loyer',
  categoryId: 'cat-loyer',
  expectedAmount: null,
  category: { id: 'cat-loyer', name: 'Loyer' },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.recurringExpense.findMany).mockResolvedValue([
    template,
  ] as never);
});

describe('getMissingRecurringExpenses', () => {
  it('exclut les lignes de salaire du contrôle', async () => {
    // La requête reçoit `salaryPaymentId: null` : une ligne de salaire ne peut
    // pas « saisir » la dépense récurrente d'une catégorie.
    vi.mocked(prisma.expense.findMany).mockResolvedValue([] as never);

    const missing = await getMissingRecurringExpenses();

    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ salaryPaymentId: null }),
      })
    );
    expect(missing.map((m) => m.id)).toEqual(['t1']);
  });

  it('une vraie dépense de la catégorie éteint l’alerte', async () => {
    vi.mocked(prisma.expense.findMany).mockResolvedValue([
      { categoryId: 'cat-loyer' },
    ] as never);

    const missing = await getMissingRecurringExpenses();

    expect(missing).toEqual([]);
  });
});
