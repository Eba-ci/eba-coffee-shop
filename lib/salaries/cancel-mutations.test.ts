// Annulation d'un versement : jamais supprimé, motif obligatoire, idempotente,
// refusée sur une caisse espèces déjà clôturée, ligne globale recalculée.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ default: { $transaction: vi.fn() } }));
vi.mock('./expense-sync', async (orig) => ({
  ...(await orig<typeof import('./expense-sync')>()),
  syncSalaryExpenses: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { syncSalaryExpenses } from './expense-sync';
import { cancelSalaryPayment } from './cancel-mutations';

const payment = {
  id: 'p1',
  date: new Date(Date.UTC(2026, 10, 1)),
  paymentMethod: 'WAVE',
  canceledAt: null,
};

function use(over: { payment?: unknown; closing?: unknown } = {}) {
  const t = {
    salaryPayment: {
      findUnique: vi
        .fn()
        .mockResolvedValue('payment' in over ? over.payment : payment),
      update: vi.fn().mockResolvedValue({}),
    },
    cashClosing: {
      findUnique: vi.fn().mockResolvedValue(over.closing ?? null),
    },
  };
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (x: unknown) => unknown
  ) => fn(t)) as never);
  return t;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN' },
  } as never);
});

describe('cancelSalaryPayment', () => {
  it('annule sans supprimer, détache la ligne globale et la recalcule', async () => {
    const t = use();
    await expect(
      cancelSalaryPayment({ paymentId: 'p1', reason: 'Erreur de saisie' })
    ).resolves.toEqual({ id: 'p1', replayed: false });
    expect(t.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({
        canceledById: 'admin-1',
        cancelReason: 'Erreur de saisie',
        expenseId: null,
      }),
    });
    expect(syncSalaryExpenses).toHaveBeenCalledTimes(1);
  });

  it('exige un motif', async () => {
    use();
    await expect(
      cancelSalaryPayment({ paymentId: 'p1', reason: ' ' })
    ).rejects.toThrow();
  });

  it('rejeu : un versement déjà annulé ne change rien', async () => {
    const t = use({ payment: { ...payment, canceledAt: new Date() } });
    await expect(
      cancelSalaryPayment({ paymentId: 'p1', reason: 'Erreur de saisie' })
    ).resolves.toEqual({ id: 'p1', replayed: true });
    expect(t.salaryPayment.update).not.toHaveBeenCalled();
    expect(syncSalaryExpenses).not.toHaveBeenCalled();
  });

  it('refuse un versement en espèces sur une caisse déjà clôturée', async () => {
    const t = use({
      payment: { ...payment, paymentMethod: 'CASH' },
      closing: { id: 'c1' },
    });
    await expect(
      cancelSalaryPayment({ paymentId: 'p1', reason: 'Erreur de saisie' })
    ).rejects.toThrow(/clôturée/);
    expect(t.salaryPayment.update).not.toHaveBeenCalled();
  });

  it('un versement Wave n’est pas bloqué par une clôture de caisse', async () => {
    const t = use({ closing: { id: 'c1' } });
    await cancelSalaryPayment({ paymentId: 'p1', reason: 'Erreur de saisie' });
    expect(t.cashClosing.findUnique).not.toHaveBeenCalled();
    expect(t.salaryPayment.update).toHaveBeenCalled();
  });
});
