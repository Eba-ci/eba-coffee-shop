// `getMonthlySalaryTotal` est LA source du point mort (#443) : il inclut les
// primes et retenues actives du mois. Il ne charge PAS les versements : un
// arriéré (dette de trésorerie) ne peut donc pas doubler une charge déjà
// comptée dans son mois d'origine (#444).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: { employee: { findMany: vi.fn() } },
}));

import prisma from '@/lib/prisma';
import { getMonthlySalaryTotal } from './queries';

const day = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));

function employeeRow(
  adjustments: {
    month: string;
    nature: 'PRIME' | 'RETENUE';
    amount: number;
    canceledAt: Date | null;
  }[] = []
) {
  return {
    startDate: day(2020, 1, 1),
    endDate: null,
    rates: [{ monthlyAmount: 300_000, startDate: day(2020, 1, 1) }],
    adjustments,
  };
}

beforeEach(() => {
  vi.mocked(prisma.employee.findMany).mockReset();
});

describe('getMonthlySalaryTotal et les ajustements', () => {
  it('ajoute une prime de 50 000 F au total du mois', async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      employeeRow([
        {
          month: '2026-11',
          nature: 'PRIME',
          amount: 50_000,
          canceledAt: null,
        },
      ]),
    ] as never);
    await expect(getMonthlySalaryTotal('2026-11')).resolves.toBe(350_000);
  });

  it('déduit une retenue et ignore un ajustement annulé', async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      employeeRow([
        {
          month: '2026-11',
          nature: 'RETENUE',
          amount: 20_000,
          canceledAt: null,
        },
        {
          month: '2026-11',
          nature: 'PRIME',
          amount: 50_000,
          canceledAt: new Date(),
        },
      ]),
    ] as never);
    await expect(getMonthlySalaryTotal('2026-11')).resolves.toBe(280_000);
  });

  it('ne charge aucun versement : l’arriéré ne peut pas doubler le point mort', async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      employeeRow(),
    ] as never);
    await getMonthlySalaryTotal('2026-11');
    const arg = vi.mocked(prisma.employee.findMany).mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(arg.select).not.toHaveProperty('payments');
    expect(arg.select).toHaveProperty('adjustments');
  });
});
