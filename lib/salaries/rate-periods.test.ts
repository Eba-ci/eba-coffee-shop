import { describe, expect, it } from 'vitest';
import {
  paidImpactMessage,
  paidMonthImpacts,
  planRatePeriods,
  type RatePeriod,
} from './rate-periods';

const employee = { startDate: '2026-01-15', endDate: null };
const open: RatePeriod = {
  id: 'r1',
  monthlyAmount: 75_000,
  startDate: '2026-01-01',
  endDate: null,
};

describe('planRatePeriods', () => {
  it('une augmentation ferme le taux en cours à la fin du mois précédent', () => {
    const p = planRatePeriods(
      [open],
      { monthlyAmount: 100_000, startMonth: '2026-12', endMonth: null },
      employee.startDate
    );
    expect(p).toMatchObject({
      ok: true,
      closed: [{ id: 'r1', endDate: '2026-11-30' }],
    });
    if (p.ok) {
      expect(p.rates.map((r) => r.startDate)).toEqual([
        '2026-01-01',
        '2026-12-01',
      ]);
    }
  });

  it('refuse un chevauchement avec un taux borné', () => {
    const closed = { ...open, endDate: '2026-06-30' };
    const p = planRatePeriods(
      [closed],
      { monthlyAmount: 90_000, startMonth: '2026-06', endMonth: '2026-08' },
      employee.startDate
    );
    expect(p.ok).toBe(false);
  });

  it('accepte un ancien taux borné qui précède un taux existant', () => {
    const later = { ...open, id: 'r2', startDate: '2026-07-01' };
    const p = planRatePeriods(
      [later],
      { monthlyAmount: 60_000, startMonth: '2026-01', endMonth: '2026-06' },
      employee.startDate
    );
    expect(p.ok).toBe(true);
  });

  it('refuse un taux ouvert qui avalerait un taux plus récent', () => {
    const later = { ...open, id: 'r2', startDate: '2026-07-01' };
    const p = planRatePeriods(
      [later],
      { monthlyAmount: 60_000, startMonth: '2026-01', endMonth: null },
      employee.startDate
    );
    expect(p.ok).toBe(false);
  });

  it('modifier un taux l’exclut de ses propres contrôles', () => {
    const p = planRatePeriods(
      [open],
      {
        id: 'r1',
        monthlyAmount: 80_000,
        startMonth: '2026-01',
        endMonth: null,
      },
      employee.startDate
    );
    expect(p.ok).toBe(true);
  });

  it('refuse une fin avant le début et un début avant l’entrée', () => {
    expect(
      planRatePeriods(
        [],
        { monthlyAmount: 1, startMonth: '2026-05', endMonth: '2026-04' },
        employee.startDate
      ).ok
    ).toBe(false);
    expect(
      planRatePeriods(
        [],
        { monthlyAmount: 1, startMonth: '2025-12', endMonth: null },
        employee.startDate
      ).ok
    ).toBe(false);
  });
});

describe('paidMonthImpacts', () => {
  const before: RatePeriod[] = [open];

  it('un changement sur un mois sans versement ne bloque rien', () => {
    const after: RatePeriod[] = [{ ...open, monthlyAmount: 80_000 }];
    expect(paidMonthImpacts(employee, before, after, [])).toEqual([]);
  });

  it('un mois versé dont le dû change est signalé avec l’écart', () => {
    const after: RatePeriod[] = [{ ...open, monthlyAmount: 80_000 }];
    const impacts = paidMonthImpacts(employee, before, after, ['2026-03']);
    expect(impacts).toEqual([
      { month: '2026-03', before: 75_000, after: 80_000 },
    ]);
    expect(paidImpactMessage(impacts)).toMatch(/2026-03.*75.000.*80.000/);
  });

  it('une augmentation à partir de décembre ne touche pas novembre versé', () => {
    const after: RatePeriod[] = [
      { ...open, endDate: '2026-11-30' },
      { monthlyAmount: 100_000, startDate: '2026-12-01', endDate: null },
    ];
    expect(paidMonthImpacts(employee, before, after, ['2026-11'])).toEqual([]);
  });
});
