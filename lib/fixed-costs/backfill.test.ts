import { describe, expect, it } from 'vitest';
import { fixedCostBackfillSchema } from '@/lib/schemas/fixed-cost';
import { planBackfillCreate, planBackfillStart } from './backfill';
import { occurrencesInRange } from './schedule';

const ctx = { today: '2026-11-15', firstDetectedMonth: '2026-03' };
const base = fixedCostBackfillSchema.parse({
  categoryId: 'c',
  startDate: '2026-03-05',
  label: 'Loyer',
  amount: 150000,
});

describe('planBackfillStart', () => {
  it('accepte la prise d’effet au premier mois détecté, sans avertissement', () => {
    expect(planBackfillStart('2026-03-05', ctx)).toEqual({
      ok: true,
      startDate: '2026-03-05',
      warning: null,
    });
  });
  it('refuse une date future', () => {
    expect(planBackfillStart('2026-12-01', ctx).ok).toBe(false);
  });
  it('avertit si la prise d’effet est postérieure au premier mois détecté', () => {
    const r = planBackfillStart('2026-05-01', ctx);
    expect(r.ok && r.warning).toMatch(/hors périmètre/);
  });
  it('accepte aujourd’hui', () => {
    expect(planBackfillStart('2026-11-15', ctx).ok).toBe(true);
  });
});

describe('planBackfillCreate', () => {
  it('accepte une création mensuelle valide', () => {
    expect(planBackfillCreate(base, ctx).ok).toBe(true);
  });
  it('refuse un montant nul ou absent', () => {
    expect(planBackfillCreate({ ...base, amount: 0 }, ctx).ok).toBe(false);
    expect(planBackfillCreate({ ...base, amount: undefined }, ctx).ok).toBe(
      false
    );
  });
  it('refuse une charge par jour ouvré', () => {
    expect(planBackfillCreate({ ...base, periodicity: 'DAILY' }, ctx).ok).toBe(
      false
    );
  });
  it('refuse des échéances incohérentes avec la périodicité', () => {
    const r = planBackfillCreate(
      { ...base, installments: [{ monthOffset: 2, day: 5, amount: 150000 }] },
      ctx
    );
    expect(r.ok).toBe(false);
  });
  it('refuse une date future', () => {
    expect(
      planBackfillCreate({ ...base, startDate: '2027-01-01' }, ctx).ok
    ).toBe(false);
  });
});

describe('occurrences d’un backfill', () => {
  it('les mois passés sans dépense liée sont « en retard », pas « à venir »', () => {
    const occ = occurrencesInRange(
      {
        id: 'x',
        label: 'Loyer',
        amount: 150000,
        periodicity: 'MONTHLY',
        startDate: '2026-03-05',
        endDate: null,
        active: true,
        categoryId: 'c',
        installments: [],
      },
      '2026-03-01',
      '2026-12-31',
      [],
      '2026-11-15'
    );
    expect(occ[0].dueDate).toBe('2026-03-05');
    const past = occ.filter((o) => o.dueDate < '2026-11-15');
    expect(past).toHaveLength(9);
    expect(past.every((o) => o.status === 'LATE' && o.paid === 0)).toBe(true);
    expect(occ.at(-1)?.status).toBe('UPCOMING');
  });
});
