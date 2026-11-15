// Tests des écritures de versement : la ligne globale est recalculée DANS la
// même transaction (ancienne ET nouvelle position), et l'idempotence est
// conservée.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  default: {
    salaryPayment: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('./expense-sync', async (orig) => ({
  ...(await orig<typeof import('./expense-sync')>()),
  syncSalaryExpenses: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth-helpers';
import { syncSalaryExpenses } from './expense-sync';
import prisma from '@/lib/prisma';
import { SalaryIdempotencyConflictError } from './errors';
import {
  deleteSalaryPayment,
  recordSalaryPayment,
  updateSalaryPayment,
} from './mutations';

const paymentRow = {
  id: 'p1',
  employeeId: 'e1',
  date: new Date(Date.UTC(2026, 5, 30)),
  month: '2026-06',
  amount: 200_000,
  type: 'SALAIRE' as const,
  paymentMethod: 'WAVE' as const,
};

function txMock(overrides: Record<string, unknown> = {}) {
  const tx = {
    salaryPayment: {
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...paymentRow, ...data })
        ),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...paymentRow, ...data })
        ),
      delete: vi.fn().mockResolvedValue(paymentRow),
      findUniqueOrThrow: vi.fn().mockResolvedValue(paymentRow),
    },
    ...overrides,
  };
  return tx;
}

function withTransaction(tx: ReturnType<typeof txMock>) {
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (t: unknown) => unknown
  ) => fn(tx)) as never);
  return tx;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN' },
  } as never);
  vi.mocked(prisma.salaryPayment.findUnique).mockResolvedValue(null);
});

const createInput = {
  employeeId: 'e1',
  date: '2026-06-30',
  month: '2026-06',
  amount: 200_000,
  type: 'SALAIRE' as const,
};

describe('recordSalaryPayment', () => {
  it('crée le versement puis recalcule la ligne globale (même transaction)', async () => {
    const tx = withTransaction(txMock());

    await recordSalaryPayment(createInput);

    expect(tx.salaryPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'e1',
        amount: 200_000,
        // Défaut WAVE posé par le schéma.
        paymentMethod: 'WAVE',
        createdById: 'admin-1',
      }),
    });
    expect(syncSalaryExpenses).toHaveBeenCalledWith(
      tx,
      [{ date: expect.any(Date), paymentMethod: 'WAVE' }],
      'admin-1'
    );
  });

  it('respecte le mode de paiement explicite (espèces)', async () => {
    withTransaction(txMock());

    await recordSalaryPayment({ ...createInput, paymentMethod: 'CASH' });

    expect(syncSalaryExpenses).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ paymentMethod: 'CASH' })],
      'admin-1'
    );
  });

  it('rejeu idempotent : contenu identique → versement existant, sans écriture', async () => {
    vi.mocked(prisma.salaryPayment.findUnique).mockResolvedValue(
      paymentRow as never
    );
    const tx = withTransaction(txMock());

    const res = await recordSalaryPayment({
      ...createInput,
      idempotencyKey: 'k1',
    });

    expect(res).toBe(paymentRow);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
  });

  it('rejeu idempotent : contenu différent → conflit', async () => {
    vi.mocked(prisma.salaryPayment.findUnique).mockResolvedValue({
      ...paymentRow,
      amount: 999,
    } as never);

    await expect(
      recordSalaryPayment({ ...createInput, idempotencyKey: 'k1' })
    ).rejects.toBeInstanceOf(SalaryIdempotencyConflictError);
  });
});

describe('updateSalaryPayment', () => {
  it('recalcule l’ancienne ET la nouvelle ligne (jour ou mode changé)', async () => {
    const tx = withTransaction(txMock());

    await updateSalaryPayment('p1', { amount: 300_000, paymentMethod: 'CASH' });

    expect(tx.salaryPayment.update).toHaveBeenCalled();
    expect(syncSalaryExpenses).toHaveBeenCalledWith(
      tx,
      [
        { date: paymentRow.date, paymentMethod: 'WAVE' },
        expect.objectContaining({ paymentMethod: 'CASH' }),
      ],
      'admin-1'
    );
  });
});

describe('deleteSalaryPayment', () => {
  it('supprime le versement PUIS recalcule sa ligne, sans orphelin', async () => {
    const tx = withTransaction(txMock());
    tx.salaryPayment.findUnique = vi.fn().mockResolvedValue(paymentRow);

    await deleteSalaryPayment('p1');

    expect(tx.salaryPayment.delete).toHaveBeenCalledWith({
      where: { id: 'p1' },
    });
    expect(syncSalaryExpenses).toHaveBeenCalledWith(
      tx,
      [{ date: paymentRow.date, paymentMethod: 'WAVE' }],
      'admin-1'
    );
    const deleteOrder = tx.salaryPayment.delete.mock.invocationCallOrder[0];
    const syncOrder = vi.mocked(syncSalaryExpenses).mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(syncOrder);
  });

  it('un versement déjà supprimé est un no-op', async () => {
    const tx = withTransaction(txMock());
    tx.salaryPayment.findUnique = vi.fn().mockResolvedValue(null);

    await expect(deleteSalaryPayment('p1')).resolves.toBeNull();
    expect(syncSalaryExpenses).not.toHaveBeenCalled();
  });
});
