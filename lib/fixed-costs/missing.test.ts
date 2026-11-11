import { describe, expect, it } from 'vitest';
import { findMissingPeriods, type FixedCostWithCategory } from './missing';

const rent: FixedCostWithCategory = {
  id: 'rent',
  label: 'Loyer',
  amount: 250_000,
  periodicity: 'MONTHLY',
  startDate: '2026-08-15',
  endDate: null,
  active: true,
  categoryId: 'cat-loyer',
};

describe('findMissingPeriods', () => {
  it('signale les mois échus sans dépense, jamais le mois en cours', () => {
    const expenses = new Map([['cat-loyer', ['2026-09-03']]]);
    const missing = findMissingPeriods([rent], expenses, '2026-11-11');
    expect(missing.map((m) => m.periodStart)).toEqual([
      '2026-08-01',
      '2026-10-01',
    ]);
  });

  it('ne regarde pas la catégorie des autres charges', () => {
    const expenses = new Map([['autre', ['2026-08-20', '2026-10-05']]]);
    expect(findMissingPeriods([rent], expenses, '2026-11-11')).toHaveLength(3);
  });

  it('s’arrête à la date de fin et ignore inactives / journalières', () => {
    const ended = { ...rent, endDate: '2026-09-30' };
    expect(
      findMissingPeriods([ended], new Map(), '2026-11-11').map(
        (m) => m.periodStart
      )
    ).toEqual(['2026-08-01', '2026-09-01']);
    expect(
      findMissingPeriods([{ ...rent, active: false }], new Map(), '2026-11-11')
    ).toEqual([]);
    expect(
      findMissingPeriods(
        [{ ...rent, periodicity: 'DAILY' }],
        new Map(),
        '2026-11-11'
      )
    ).toEqual([]);
  });

  it('gère les trimestres', () => {
    const q = {
      ...rent,
      periodicity: 'QUARTERLY' as const,
      startDate: '2026-01-10',
    };
    const expenses = new Map([['cat-loyer', ['2026-02-01']]]);
    expect(
      findMissingPeriods([q], expenses, '2026-11-11').map((m) => m.periodStart)
    ).toEqual(['2026-04-01', '2026-07-01']);
  });
});
