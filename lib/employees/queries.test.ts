// Garde ADMIN + COMPTABLE des lectures de la page Employés (#440). Chaque
// lecture exportée doit refuser AVANT d'atteindre la base : aucune donnée
// salariale ne peut partir dans la réponse d'un MANAGER ou d'un ANALYSTE.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    employee: { findMany: vi.fn(), findUnique: vi.fn() },
    salaryPayment: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('@/lib/auth-helpers', () => ({ requirePayroll: vi.fn() }));

import { requirePayroll } from '@/lib/auth-helpers';
import { getEmployee360, listEmployeesOverview } from './queries';

const day = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    name: 'Awa Traoré',
    position: 'Barista',
    startDate: day(2026, 1, 1),
    endDate: null,
    active: true,
    note: null,
    rates: [],
    payments: [],
    adjustments: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.employee.findMany.mockResolvedValue([]);
  prismaMock.employee.findUnique.mockResolvedValue(null);
});

describe('lectures Employés : garde ADMIN + COMPTABLE', () => {
  beforeEach(() => {
    vi.mocked(requirePayroll).mockRejectedValue(new Error('Non autorisé'));
  });

  it('listEmployeesOverview refuse sans lire la base', async () => {
    await expect(listEmployeesOverview('2026-11')).rejects.toThrow(
      'Non autorisé'
    );
    expect(prismaMock.employee.findMany).not.toHaveBeenCalled();
  });

  it('getEmployee360 refuse sans lire la base', async () => {
    await expect(getEmployee360('e1', '2026-11')).rejects.toThrow(
      'Non autorisé'
    );
    expect(prismaMock.employee.findUnique).not.toHaveBeenCalled();
  });
});

describe('getEmployee360 : données réelles, cas incomplets', () => {
  const session = { user: { id: 'u1', role: 'COMPTABLE' } };

  beforeEach(() => {
    vi.mocked(requirePayroll).mockResolvedValue(session as never);
  });

  it('renvoie null pour un employé inconnu', async () => {
    prismaMock.employee.findUnique.mockResolvedValue(null);
    await expect(getEmployee360('inconnu', '2026-11')).resolves.toBeNull();
  });

  it('affiche un employé sans taux ni versement sans erreur', async () => {
    prismaMock.employee.findUnique.mockResolvedValue(employeeRow() as never);
    const result = await getEmployee360('e1', '2026-11');
    expect(result).not.toBeNull();
    expect(result?.currentRate).toBeNull();
    expect(result?.month.due).toBe(0);
    expect(result?.month.remainingToPay).toBe(0);
    expect(result?.advanceBalance).toBe(0);
    expect(result?.arrears.total).toBe(0);
    expect(result?.payments).toEqual([]);
  });

  it('calcule le dû du mois depuis le taux en vigueur', async () => {
    prismaMock.employee.findUnique.mockResolvedValue(
      employeeRow({
        startDate: day(2026, 11, 1),
        rates: [{ monthlyAmount: 300_000, startDate: day(2026, 11, 1) }],
      }) as never
    );
    const result = await getEmployee360('e1', '2026-11');
    expect(result?.currentRate).toBe(300_000);
    expect(result?.month.due).toBe(300_000);
    expect(result?.month.remainingToPay).toBe(300_000);
    expect(result?.proposedPayment.total).toBe(300_000);
  });

  it('signale un mois clôturé impayé dans l’arriéré, hors mois courant', async () => {
    prismaMock.employee.findUnique.mockResolvedValue(
      employeeRow({
        startDate: day(2025, 1, 1),
        rates: [{ monthlyAmount: 100_000, startDate: day(2025, 1, 1) }],
      }) as never
    );
    const result = await getEmployee360('e1', '2026-11');
    expect(result?.arrears.total).toBeGreaterThan(0);
    expect(result?.arrears.months.every((m) => m.month < '2026-11')).toBe(true);
  });
});

describe('listEmployeesOverview : jointure et ordre', () => {
  beforeEach(() => {
    vi.mocked(requirePayroll).mockResolvedValue({
      user: { id: 'u1', role: 'ADMIN' },
    } as never);
  });

  it('joint taux en vigueur et situation du mois, actifs puis sortis', async () => {
    prismaMock.employee.findMany.mockResolvedValue([
      employeeRow({
        id: 'e1',
        rates: [{ monthlyAmount: 200_000, startDate: day(2026, 1, 1) }],
      }),
      employeeRow({ id: 'e2', name: 'Koffi', active: false }),
    ] as never);
    const result = await listEmployeesOverview('2026-11');
    expect(result.month).toBe('2026-11');
    expect(result.employees.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(result.employees[0].currentRate).toBe(200_000);
    expect(result.employees[0].month.due).toBe(200_000);
    expect(result.employees[1].currentRate).toBeNull();
  });
});
