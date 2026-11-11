// Tests des écritures de versement : le versement et sa dépense liée naissent,
// changent et disparaissent ENSEMBLE (même transaction), sans jamais laisser
// de dépense orpheline, et l'idempotence est conservée.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  default: {
    salaryPayment: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { requireAdmin } from '@/lib/auth-helpers';
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
    },
    expenseCategory: {
      upsert: vi.fn().mockResolvedValue({ id: 'cat-sal' }),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
    },
    expense: {
      create: vi.fn().mockResolvedValue({ id: 'x1' }),
      upsert: vi.fn().mockResolvedValue({ id: 'x1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
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
  it('crée la dépense liée dans la même transaction, sans numéro de reçu', async () => {
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
    expect(tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 200_000,
        paymentMethod: 'WAVE',
        categoryId: 'cat-sal',
        salaryPaymentId: 'p1',
        createdById: 'admin-1',
        receiptNo: null,
        receiptPeriod: null,
        receiptSeq: null,
        supplier: null,
        note: null,
      }),
    });
  });

  it('respecte le mode de paiement explicite (espèces)', async () => {
    const tx = withTransaction(txMock());

    await recordSalaryPayment({ ...createInput, paymentMethod: 'CASH' });

    expect(tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentMethod: 'CASH' }),
    });
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
  it('met à jour la dépense liée dans la même transaction (upsert)', async () => {
    const tx = withTransaction(txMock());

    await updateSalaryPayment('p1', { amount: 300_000, paymentMethod: 'CASH' });

    expect(tx.salaryPayment.update).toHaveBeenCalled();
    expect(tx.expense.upsert).toHaveBeenCalledWith({
      where: { salaryPaymentId: 'p1' },
      create: expect.objectContaining({
        salaryPaymentId: 'p1',
        categoryId: 'cat-sal',
        receiptNo: null,
      }),
      update: expect.objectContaining({
        amount: 300_000,
        paymentMethod: 'CASH',
        receiptNo: null,
      }),
    });
  });

  it('un versement hérité sans dépense est rattrapé par le create de l’upsert', async () => {
    const tx = withTransaction(txMock());

    await updateSalaryPayment('p1', { note: 'correction' });

    // Une seule requête atomique : pas de findUnique+create (course → P2002).
    expect(tx.expense.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { salaryPaymentId: 'p1' },
        create: expect.objectContaining({ salaryPaymentId: 'p1' }),
      })
    );
  });
});

describe('deleteSalaryPayment', () => {
  it('supprime la dépense liée PUIS le versement, sans orphelin', async () => {
    const tx = withTransaction(txMock());

    await deleteSalaryPayment('p1');

    expect(tx.expense.deleteMany).toHaveBeenCalledWith({
      where: { salaryPaymentId: 'p1' },
    });
    expect(tx.salaryPayment.delete).toHaveBeenCalledWith({
      where: { id: 'p1' },
    });
  });
});
