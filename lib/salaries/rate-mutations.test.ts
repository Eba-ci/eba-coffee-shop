// Taux en mois entiers : pas de chevauchement, fermeture automatique du taux en
// cours, refus (sans forçage) quand un mois déjà versé changerait de dû.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    salaryRate: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
  },
}));

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import {
  addSalaryRate,
  deleteSalaryRate,
  updateSalaryRate,
} from './rate-mutations';

const d = (y: number, m: number, day: number) =>
  new Date(Date.UTC(y, m - 1, day));

function tx(opts: { paid?: string[]; rates?: object[] } = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    employee: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        startDate: d(2026, 1, 1),
        endDate: null,
        rates: opts.rates ?? [
          {
            id: 'r1',
            monthlyAmount: 75_000,
            startDate: d(2026, 1, 1),
            endDate: null,
          },
        ],
        payments: (opts.paid ?? []).map((month) => ({ month })),
      }),
    },
    salaryRate: {
      create: vi.fn().mockResolvedValue({ id: 'new' }),
      update: vi.fn().mockResolvedValue({ id: 'r1' }),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
}
function use(t: ReturnType<typeof tx>) {
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (x: unknown) => unknown
  ) => fn(t)) as never);
  return t;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: 'a', role: 'ADMIN' },
  } as never);
});

const add = {
  employeeId: 'e1',
  monthlyAmount: 100_000,
  startMonth: '2026-12',
  endMonth: null,
};

describe('addSalaryRate', () => {
  it('une augmentation ferme le taux en cours et commence le 1er du mois', async () => {
    const t = use(tx({ paid: ['2026-11'] }));
    await addSalaryRate(add);
    expect(t.salaryRate.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { endDate: d(2026, 11, 30) },
    });
    expect(t.salaryRate.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'e1',
        monthlyAmount: 100_000,
        startDate: d(2026, 12, 1),
        endDate: null,
      },
    });
  });

  it('refuse un taux qui changerait un mois déjà versé (aucune écriture)', async () => {
    const t = use(tx({ paid: ['2026-03'] }));
    await expect(
      addSalaryRate({ ...add, startMonth: '2026-02', endMonth: '2026-04' })
    ).rejects.toThrow(/mois déjà versés/);
    expect(t.salaryRate.create).not.toHaveBeenCalled();
    expect(t.salaryRate.update).not.toHaveBeenCalled();
  });

  it('un ancien taux sur des mois non versés est accepté', async () => {
    const t = use(
      tx({
        rates: [
          {
            id: 'r2',
            monthlyAmount: 90_000,
            startDate: d(2026, 7, 1),
            endDate: null,
          },
        ],
      })
    );
    await addSalaryRate({
      ...add,
      monthlyAmount: 60_000,
      startMonth: '2026-01',
      endMonth: '2026-06',
    });
    expect(t.salaryRate.create).toHaveBeenCalled();
  });
});

describe('updateSalaryRate / deleteSalaryRate', () => {
  it('modifier un taux sans mois versé touché réussit', async () => {
    vi.mocked(prisma.salaryRate.findUniqueOrThrow).mockResolvedValue({
      employeeId: 'e1',
    } as never);
    const t = use(tx());
    await updateSalaryRate({
      rateId: 'r1',
      monthlyAmount: 80_000,
      startMonth: '2026-01',
      endMonth: null,
    });
    expect(t.salaryRate.update).toHaveBeenCalledTimes(1);
  });

  it('modifier le montant d’un mois versé est refusé', async () => {
    vi.mocked(prisma.salaryRate.findUniqueOrThrow).mockResolvedValue({
      employeeId: 'e1',
    } as never);
    const t = use(tx({ paid: ['2026-05'] }));
    await expect(
      updateSalaryRate({
        rateId: 'r1',
        monthlyAmount: 80_000,
        startMonth: '2026-01',
        endMonth: null,
      })
    ).rejects.toThrow(/Annulez d’abord/);
    expect(t.salaryRate.update).not.toHaveBeenCalled();
  });

  it('supprimer le seul taux d’un mois versé est refusé ; un rejeu est idempotent', async () => {
    vi.mocked(prisma.salaryRate.findUnique).mockResolvedValue({
      employeeId: 'e1',
    } as never);
    const t = use(tx({ paid: ['2026-05'] }));
    await expect(deleteSalaryRate({ rateId: 'r1' })).rejects.toThrow(
      /mois déjà versés/
    );
    expect(t.salaryRate.delete).not.toHaveBeenCalled();

    vi.mocked(prisma.salaryRate.findUnique).mockResolvedValue(null);
    await expect(deleteSalaryRate({ rateId: 'r1' })).resolves.toEqual({
      id: 'r1',
      deleted: true,
    });
  });
});
