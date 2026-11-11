import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    employee: { findMany: vi.fn(), update: vi.fn() },
    salaryPayment: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import {
  anonymizeExpiredSalaryData,
  anonymizedEmployeeName,
  isSalaryRetentionExpired,
} from './retention';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = day('2026-06-30'); // coupure = 2016-06-30

describe('isSalaryRetentionExpired (pur)', () => {
  it('jamais pour un employé en poste (pas de date de sortie)', () => {
    expect(isSalaryRetentionExpired(null, new Date('2030-01-01'))).toBe(false);
  });

  it('n’expire qu’APRÈS la durée depuis la sortie', () => {
    expect(isSalaryRetentionExpired('2016-06-30', NOW)).toBe(false);
    expect(isSalaryRetentionExpired('2016-06-29', NOW)).toBe(true);
    expect(isSalaryRetentionExpired('2016-06-30', day('2026-07-01'))).toBe(
      true
    );
  });

  it('respecte la durée passée en paramètre', () => {
    expect(isSalaryRetentionExpired('2020-01-01', NOW, 5)).toBe(true);
    expect(isSalaryRetentionExpired('2020-01-01', NOW, 10)).toBe(false);
  });
});

describe('anonymizeExpiredSalaryData — bornes J-1 / J / J+1 par le chemin réel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockResolvedValue([]);
  });

  // `NOW` = 2026-06-30, durée 10 ans → coupure exacte 2016-06-30.
  const boundaryEmployees = [
    { id: 'j-moins-1', endDate: day('2016-06-29') }, // expiré
    { id: 'j', endDate: day('2016-06-30') }, // borne : pas encore
    { id: 'j-plus-1', endDate: day('2016-07-01') }, // pas expiré
  ];

  it('n’anonymise QUE J-1 (coupure exclusive), pas J ni J+1', async () => {
    prismaMock.employee.findMany.mockResolvedValue(boundaryEmployees);

    const done = await anonymizeExpiredSalaryData(NOW);

    expect(done).toBe(1);
    expect(prismaMock.employee.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.employee.update).toHaveBeenCalledWith({
      where: { id: 'j-moins-1' },
      data: {
        name: anonymizedEmployeeName('j-moins-1'),
        position: null,
        note: null,
        active: false,
      },
    });
    // Une seule borne : le filtre base ne recalcule PAS la coupure.
    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    expect(where.endDate).toEqual({ not: null });
  });

  it('ne touche à rien quand aucun employé sorti n’est échu', async () => {
    prismaMock.employee.findMany.mockResolvedValue([
      { id: 'j', endDate: day('2016-06-30') },
      { id: 'j-plus-1', endDate: day('2016-07-01') },
      { id: 'sans-sortie', endDate: null },
    ]);

    expect(await anonymizeExpiredSalaryData(NOW)).toBe(0);
    expect(prismaMock.employee.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
