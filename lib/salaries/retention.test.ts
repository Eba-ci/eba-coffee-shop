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

describe('isSalaryRetentionExpired (pur)', () => {
  it('jamais pour un employé en poste (pas de date de sortie)', () => {
    expect(isSalaryRetentionExpired(null, new Date('2030-01-01'))).toBe(false);
  });

  it('n’expire qu’APRÈS la durée depuis la sortie', () => {
    // 10 ans après la sortie : pas encore (borne égale), puis expiré.
    expect(isSalaryRetentionExpired('2016-06-30', new Date('2026-06-30'))).toBe(
      false
    );
    expect(isSalaryRetentionExpired('2016-06-29', new Date('2026-06-30'))).toBe(
      true
    );
    expect(isSalaryRetentionExpired('2016-06-30', new Date('2026-07-01'))).toBe(
      true
    );
  });

  it('respecte la durée passée en paramètre', () => {
    expect(
      isSalaryRetentionExpired('2020-01-01', new Date('2026-01-01'), 5)
    ).toBe(true);
    expect(
      isSalaryRetentionExpired('2020-01-01', new Date('2026-01-01'), 10)
    ).toBe(false);
  });
});

describe('anonymizeExpiredSalaryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it('anonymise nom / poste / note des employés sortis échus, garde les montants', async () => {
    prismaMock.employee.findMany.mockResolvedValue([{ id: 'e1' }]);

    const done = await anonymizeExpiredSalaryData(new Date('2026-06-30'));

    expect(done).toBe(1);
    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    // La borne de coupure est bien 10 ans avant `now` ; jamais avant la durée.
    expect((where.endDate.lt as Date).getUTCFullYear()).toBe(2016);
    expect(where.endDate.not).toBe(null);
    expect(prismaMock.employee.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: {
        name: anonymizedEmployeeName('e1'),
        position: null,
        note: null,
        active: false,
      },
    });
    // Les montants (employé, versements) ne sont pas supprimés.
    expect(prismaMock.salaryPayment.updateMany).toHaveBeenCalledWith({
      where: { employeeId: 'e1' },
      data: { note: null },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
  });

  it('ne touche à rien quand aucun employé sorti n’est échu', async () => {
    prismaMock.employee.findMany.mockResolvedValue([]);
    expect(await anonymizeExpiredSalaryData()).toBe(0);
    expect(prismaMock.employee.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
