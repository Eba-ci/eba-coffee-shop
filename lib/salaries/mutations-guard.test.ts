import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    employee: { create: vi.fn(), update: vi.fn() },
    salaryRate: { create: vi.fn(), upsert: vi.fn() },
    salaryPayment: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/generated/prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {},
  },
}));

import { SALARY_RATE_DUPLICATE_MESSAGE } from '@/config/constants';
import { Prisma } from '@/generated/prisma/client';
import { requireAdmin } from '@/lib/auth-helpers';
import {
  createEmployee,
  recordSalaryPayment,
  setSalaryRate,
  updateEmployee,
} from './mutations';
import { addSalaryRate } from './rate-mutations';

const rateInput = {
  employeeId: 'e1',
  monthlyAmount: 120_000,
  startDate: '2026-11-01',
};

/**
 * Garde ADMIN explicite sur les ÉCRITURES de lib/salaries appelées par l'écran
 * Salaires : sans session ADMIN, aucune ne doit atteindre la base.
 */
describe('écritures salaires : garde ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockRejectedValue(new Error('Non autorisé'));
  });

  it.each([
    [
      'createEmployee',
      () => createEmployee({ name: 'A', startDate: '2026-01-01' }),
    ],
    ['updateEmployee', () => updateEmployee('e1', { name: 'B' })],
    ['setSalaryRate', () => setSalaryRate(rateInput)],
    ['addSalaryRate', () => addSalaryRate(rateInput)],
    [
      'recordSalaryPayment',
      () =>
        recordSalaryPayment({
          employeeId: 'e1',
          date: '2026-06-30',
          month: '2026-06',
          amount: 500,
          type: 'SALAIRE',
        }),
    ],
  ])('%s refuse un non-admin sans écrire', async (_label, call) => {
    await expect(call()).rejects.toThrow('Non autorisé');
    expect(prismaMock.employee.create).not.toHaveBeenCalled();
    expect(prismaMock.employee.update).not.toHaveBeenCalled();
    expect(prismaMock.salaryRate.upsert).not.toHaveBeenCalled();
    expect(prismaMock.salaryRate.create).not.toHaveBeenCalled();
    expect(prismaMock.salaryPayment.create).not.toHaveBeenCalled();
  });
});

describe('addSalaryRate : un taux ne s’écrase jamais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: 'admin', role: 'ADMIN' },
    } as never);
  });

  it('crée une ligne datée (create, jamais upsert)', async () => {
    prismaMock.salaryRate.create.mockResolvedValue({ id: 'r1' });

    await expect(addSalaryRate(rateInput)).resolves.toEqual({ id: 'r1' });
    expect(prismaMock.salaryRate.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'e1',
        monthlyAmount: 120_000,
        startDate: new Date(Date.UTC(2026, 10, 1)),
      },
    });
    expect(prismaMock.salaryRate.upsert).not.toHaveBeenCalled();
  });

  it('date déjà utilisée : refus lisible au lieu d’écraser', async () => {
    const conflict = Object.assign(
      new Prisma.PrismaClientKnownRequestError('duplicate'),
      { code: 'P2002' }
    );
    prismaMock.salaryRate.create.mockRejectedValue(conflict);

    await expect(addSalaryRate(rateInput)).rejects.toThrow(
      SALARY_RATE_DUPLICATE_MESSAGE
    );
  });

  it('tape un montant négatif avant toute écriture', async () => {
    await expect(
      addSalaryRate({ ...rateInput, monthlyAmount: -100 })
    ).rejects.toThrow('Le taux doit être un montant positif');
    expect(prismaMock.salaryRate.create).not.toHaveBeenCalled();
  });
});
