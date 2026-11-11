import { describe, expect, it } from 'vitest';
import {
  breakEvenRevenue,
  buildBreakEvenSeries,
  computeMarginRate,
  createOpenDayCounter,
  dailyCostFor,
  type FixedCostLike,
} from './compute';
import { periodContaining, weekdayOf } from './periods';
import { isOpenDay } from './open-days';
import { DEFAULT_SETTINGS, type PickupSettings } from '@/lib/pickup-settings';

// Novembre 2026 : le 1er est un dimanche ; lundis = 2, 9, 16, 23, 30 (5 lundis).
const closedMondays: PickupSettings = {
  ...DEFAULT_SETTINGS,
  weeklyHours: { ...DEFAULT_SETTINGS.weeklyHours, '1': [] },
};
const isOpen = (d: string) => isOpenDay(d, closedMondays);
const countOpen = createOpenDayCounter(isOpen);

const rent: FixedCostLike = {
  id: 'rent',
  label: 'Loyer',
  amount: 250_000,
  periodicity: 'MONTHLY',
  startDate: '2026-01-01',
  endDate: null,
  active: true,
};

describe('périodes', () => {
  it('connaît le jour de la semaine et les bornes', () => {
    expect(weekdayOf('2026-11-02')).toBe(1);
    expect(periodContaining('2026-11-11', 'MONTHLY')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(periodContaining('2026-11-11', 'WEEKLY')).toEqual({
      start: '2026-11-09',
      end: '2026-11-15',
    });
    expect(periodContaining('2026-11-11', 'QUARTERLY')).toEqual({
      start: '2026-10-01',
      end: '2026-12-31',
    });
    expect(periodContaining('2028-02-10', 'MONTHLY').end).toBe('2028-02-29');
  });
});

describe('coût par jour ouvré', () => {
  it('répartit sur les jours ouvrés du mois (30 − 5 lundis = 25)', () => {
    expect(dailyCostFor(rent, '2026-11-11', isOpen, countOpen)).toBe(10_000);
  });

  it('vaut 0 un jour fermé (lundi)', () => {
    expect(dailyCostFor(rent, '2026-11-09', isOpen, countOpen)).toBe(0);
  });

  it('fermer un jour de plus fait monter le coût des autres', () => {
    const withOverride: PickupSettings = {
      ...closedMondays,
      dateOverrides: [{ date: '2026-11-11', closed: true, ranges: [] }],
    };
    const open2 = (d: string) => isOpenDay(d, withOverride);
    expect(
      dailyCostFor(rent, '2026-11-12', open2, createOpenDayCounter(open2))
    ).toBeCloseTo(250_000 / 24);
  });

  it('ignore la charge avant sa prise d’effet, après sa fin ou inactive', () => {
    const later = { ...rent, startDate: '2026-11-15' };
    expect(dailyCostFor(later, '2026-11-11', isOpen, countOpen)).toBe(0);
    expect(dailyCostFor(later, '2026-11-15', isOpen, countOpen)).toBe(10_000);
    const ended = { ...rent, endDate: '2026-11-10' };
    expect(dailyCostFor(ended, '2026-11-11', isOpen, countOpen)).toBe(0);
    expect(
      dailyCostFor({ ...rent, active: false }, '2026-11-11', isOpen, countOpen)
    ).toBe(0);
  });

  it('gère les périodicités DAILY, WEEKLY, QUARTERLY, YEARLY', () => {
    const daily = { ...rent, periodicity: 'DAILY' as const, amount: 3_000 };
    expect(dailyCostFor(daily, '2026-11-11', isOpen, countOpen)).toBe(3_000);
    expect(dailyCostFor(daily, '2026-11-09', isOpen, countOpen)).toBe(0);
    // Semaine du 9 au 15 nov : lundi fermé → 6 jours ouvrés.
    const weekly = { ...rent, periodicity: 'WEEKLY' as const, amount: 60_000 };
    expect(dailyCostFor(weekly, '2026-11-11', isOpen, countOpen)).toBe(10_000);
    const quarterly = { ...rent, periodicity: 'QUARTERLY' as const };
    const q = dailyCostFor(quarterly, '2026-11-11', isOpen, countOpen);
    expect(q).toBeGreaterThan(0);
    expect(q).toBeLessThan(10_000);
    const yearly = {
      ...rent,
      periodicity: 'YEARLY' as const,
      amount: 1_000_000,
    };
    expect(
      dailyCostFor(yearly, '2026-11-11', isOpen, countOpen)
    ).toBeGreaterThan(0);
  });

  it('ne divise pas par zéro si aucun jour ouvré', () => {
    const never = () => false;
    expect(
      dailyCostFor(rent, '2026-11-11', never, createOpenDayCounter(never))
    ).toBe(0);
  });
});

describe('marge et point mort', () => {
  it('calcule le taux sur les lignes à coût connu', () => {
    expect(
      computeMarginRate({ revenue: 1000, revenueWithCost: 1000, cost: 400 })
    ).toEqual({
      rate: 0.6,
      coverage: 1,
    });
  });

  it('refuse un taux peu fiable (couverture < 50 %) ou négatif', () => {
    expect(
      computeMarginRate({ revenue: 1000, revenueWithCost: 300, cost: 100 }).rate
    ).toBeNull();
    expect(
      computeMarginRate({ revenue: 1000, revenueWithCost: 1000, cost: 1200 })
        .rate
    ).toBeNull();
    expect(
      computeMarginRate({ revenue: 0, revenueWithCost: 0, cost: 0 }).rate
    ).toBeNull();
  });

  it('point mort = charges ÷ marge ; 0 sans charge ; null sans marge', () => {
    expect(breakEvenRevenue(10_000, 0.5)).toBe(20_000);
    expect(breakEvenRevenue(0, null)).toBe(0);
    expect(breakEvenRevenue(10_000, null)).toBeNull();
  });
});

describe('série jour par jour', () => {
  const days = [
    { date: '2026-11-09', revenue: 0 }, // lundi fermé
    { date: '2026-11-10', revenue: 30_000 },
    { date: '2026-11-11', revenue: 10_000 },
  ];
  const series = buildBreakEvenSeries({
    days,
    costs: [rent],
    isOpen,
    marginRate: 0.5,
  });

  it('lundi fermé : charges 0, point mort 0, rien à atteindre', () => {
    const [monday] = series;
    expect(monday).toMatchObject({
      open: false,
      fixedCost: 0,
      breakEven: 0,
      remaining: 0,
      reached: null,
    });
  });

  it('jour ouvré : seuil, reste à faire et résultat', () => {
    expect(series[1]).toMatchObject({
      open: true,
      fixedCost: 10_000,
      breakEven: 20_000,
      remaining: 0,
      reached: true,
      grossMargin: 15_000,
      result: 5_000,
    });
    expect(series[2]).toMatchObject({
      remaining: 10_000,
      reached: false,
      result: -5_000,
    });
  });

  it('marge inconnue : seuil indéterminé, pas de faux chiffre', () => {
    const [, d] = buildBreakEvenSeries({
      days,
      costs: [rent],
      isOpen,
      marginRate: null,
    });
    expect(d).toMatchObject({
      breakEven: null,
      remaining: null,
      reached: null,
      result: null,
    });
  });
});
