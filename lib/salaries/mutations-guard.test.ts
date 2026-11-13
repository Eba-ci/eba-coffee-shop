import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    employee: { create: vi.fn(), update: vi.fn() },
    salaryRate: { upsert: vi.fn() },
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

import { requireAdmin } from '@/lib/auth-helpers';
import {
  createEmployee,
  recordSalaryPayment,
  setSalaryRate,
  updateEmployee,
} from './mutations';

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
    [
      'setSalaryRate',
      () =>
        setSalaryRate({
          employeeId: 'e1',
          monthlyAmount: 1_000,
          startDate: '2026-01-01',
        }),
    ],
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
    expect(prismaMock.salaryPayment.create).not.toHaveBeenCalled();
  });
});
