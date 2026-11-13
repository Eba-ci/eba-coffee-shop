import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type PickupSettings } from '@/lib/pickup-settings';
import {
  buildBreakEvenSeries,
  createOpenDayCounter,
  dailySalaryCost,
  fixedCostsForDay,
  SALARY_SHARE_ID,
  SALARY_SHARE_LABEL,
  type FixedCostLike,
} from './compute';
import { isOpenDay } from './open-days';

// Novembre 2026 : 30 jours, 5 lundis fermés (2, 9, 16, 23, 30) → 25 jours ouvrés.
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

const SALARIES = 100_000; // 25 jours ouvrés → 4 000 F / jour ouvré

describe('lissage des salaires sur les jours ouvrés', () => {
  it('répartit le montant global du mois sur les jours ouvrés', () => {
    expect(dailySalaryCost(SALARIES, '2026-11-11', isOpen, countOpen)).toBe(
      4_000
    );
  });

  it('vaut 0 un jour fermé', () => {
    expect(dailySalaryCost(SALARIES, '2026-11-09', isOpen, countOpen)).toBe(0);
  });

  it('vaut 0 si le mois n’a pas de salaire (0 ou négatif)', () => {
    expect(dailySalaryCost(0, '2026-11-11', isOpen, countOpen)).toBe(0);
    expect(dailySalaryCost(-1, '2026-11-11', isOpen, countOpen)).toBe(0);
  });

  it('n’ajoute aucune ligne « Salaires » sans montant', () => {
    const { total, shares } = fixedCostsForDay(
      [rent],
      '2026-11-11',
      isOpen,
      countOpen
    );
    expect(shares.some((s) => s.id === SALARY_SHARE_ID)).toBe(false);
    expect(total).toBe(10_000);
  });

  it('ajoute UNE seule ligne « Salaires », sans détail', () => {
    const { total, shares } = fixedCostsForDay(
      [rent],
      '2026-11-11',
      isOpen,
      countOpen,
      SALARIES
    );
    const salaryShares = shares.filter((s) => s.id === SALARY_SHARE_ID);
    expect(salaryShares).toHaveLength(1);
    expect(salaryShares[0]).toEqual({
      id: SALARY_SHARE_ID,
      label: SALARY_SHARE_LABEL,
      amount: 4_000,
    });
    // Aucun nom, aucun montant individuel, aucun effectif : une seule ligne.
    expect(Object.keys(salaryShares[0]).sort()).toEqual([
      'amount',
      'id',
      'label',
    ]);
    expect(total).toBe(14_000);
  });
});

describe('point mort avec et sans salaires', () => {
  const days = [
    { date: '2026-11-09', revenue: 0 }, // lundi fermé
    { date: '2026-11-10', revenue: 30_000 },
    { date: '2026-11-11', revenue: 10_000 },
  ];

  it('sans salaires : le seuil ne dépend que des charges fixes', () => {
    const [monday, tuesday] = buildBreakEvenSeries({
      days,
      costs: [rent],
      isOpen,
      marginRate: 0.5,
    });
    expect(monday.salaryCost).toBe(0);
    expect(tuesday.fixedCost).toBe(10_000);
    expect(tuesday.breakEven).toBe(20_000);
  });

  it('avec salaires : la part du mois entre dans le seuil, sans détail', () => {
    const [monday, tuesday, wednesday] = buildBreakEvenSeries({
      days,
      costs: [rent],
      isOpen,
      marginRate: 0.5,
      salariesByMonth: { '2026-11': SALARIES },
    });
    expect(monday.salaryCost).toBe(0); // fermé
    expect(monday.fixedCost).toBe(0);
    expect(tuesday.salaryCost).toBe(4_000);
    expect(tuesday.fixedCost).toBe(14_000);
    expect(tuesday.breakEven).toBe(28_000);
    const salaryShares = tuesday.shares.filter((s) => s.id === SALARY_SHARE_ID);
    expect(salaryShares).toHaveLength(1);
    // Le détail nominatif n'existe nulle part : la part est un simple nombre.
    expect(salaryShares[0].label).toBe(SALARY_SHARE_LABEL);
    expect(wednesday.breakEven).toBe(28_000);
  });

  it('un mois sans salaire n’ajoute ni erreur ni ligne', () => {
    const series = buildBreakEvenSeries({
      days,
      costs: [rent],
      isOpen,
      marginRate: 0.5,
      salariesByMonth: { '2026-12': SALARIES },
    });
    expect(series.every((d) => d.salaryCost === 0)).toBe(true);
    expect(
      series.every((d) => !d.shares.some((s) => s.id === SALARY_SHARE_ID))
    ).toBe(true);
  });

  it('changer le total global change le seuil, sans rien révéler', () => {
    const before = buildBreakEvenSeries({
      days,
      costs: [rent],
      isOpen,
      marginRate: 0.5,
      salariesByMonth: { '2026-11': 100_000 },
    });
    const after = buildBreakEvenSeries({
      days,
      costs: [rent],
      isOpen,
      marginRate: 0.5,
      salariesByMonth: { '2026-11': 200_000 },
    });
    // Même structure de sortie, seul l'agrégat change.
    expect(after[1].fixedCost).toBeGreaterThan(before[1].fixedCost);
    expect(after[1].breakEven).toBeGreaterThan(before[1].breakEven!);
    expect(after[1].shares).toHaveLength(before[1].shares.length);
  });
});
