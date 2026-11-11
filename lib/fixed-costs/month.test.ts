import { describe, expect, it } from 'vitest';
import type { BreakEvenDay } from './compute';
import {
  buildCalendarGrid,
  dayStatus,
  listMonthOptions,
  monthBounds,
  parseMonth,
  projectMonthEnd,
  shiftMonth,
  summarizeMonth,
} from './month';

const day = (date: string, over: Partial<BreakEvenDay> = {}): BreakEvenDay => ({
  date,
  open: true,
  revenue: 0,
  fixedCost: 10_000,
  breakEven: 20_000,
  remaining: 20_000,
  grossMargin: 0,
  result: -10_000,
  reached: false,
  shares: [],
  ...over,
});

/** Novembre 2026 : lundis fermés, CA de 30 000 les jours échus. */
function november(today: string): BreakEvenDay[] {
  return Array.from({ length: 30 }, (_, i) => {
    const date = `2026-11-${String(i + 1).padStart(2, '0')}`;
    const closed = [2, 9, 16, 23, 30].includes(i + 1);
    if (closed)
      return day(date, {
        open: false,
        fixedCost: 0,
        breakEven: 0,
        reached: null,
        result: 0,
      });
    if (date > today) return day(date);
    return day(date, {
      revenue: 30_000,
      remaining: 0,
      reached: true,
      grossMargin: 18_000,
      result: 8_000,
    });
  });
}

describe('navigation', () => {
  it('valide le mois, sinon retombe sur aujourd’hui', () => {
    expect(parseMonth('2026-10', '2026-11-11')).toBe('2026-10');
    expect(parseMonth('2026-13', '2026-11-11')).toBe('2026-11');
    expect(parseMonth('nimporte', '2026-11-11')).toBe('2026-11');
    expect(parseMonth(null, '2026-11-11')).toBe('2026-11');
  });

  it('borne les mois de 28, 29, 30 et 31 jours', () => {
    expect(monthBounds('2026-02').to).toBe('2026-02-28');
    expect(monthBounds('2028-02').to).toBe('2028-02-29');
    expect(monthBounds('2026-11').to).toBe('2026-11-30');
    expect(monthBounds('2026-12').to).toBe('2026-12-31');
  });

  it('passe d’une année à l’autre', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', -12)).toBe('2025-11');
  });

  it('liste les mois du sélecteur', () => {
    const opts = listMonthOptions('2026-11', 2, 1);
    expect(opts.map((o) => o.value)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(opts[2].label).toBe('novembre 2026');
  });
});

describe('calendrier', () => {
  it('commence le bon jour : novembre 2026 démarre un dimanche', () => {
    const weeks = buildCalendarGrid(november('2026-11-30'));
    expect(weeks[0].slice(0, 6).every((c) => c === null)).toBe(true);
    expect(weeks[0][6]?.date).toBe('2026-11-01');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it('un mois qui commence un lundi n’a pas de case vide en tête', () => {
    const june = Array.from({ length: 30 }, (_, i) =>
      day(`2026-06-${String(i + 1).padStart(2, '0')}`)
    );
    expect(buildCalendarGrid(june)[0][0]?.date).toBe('2026-06-01');
  });

  it('mois vide : aucune semaine', () => {
    expect(buildCalendarGrid([])).toEqual([]);
  });
});

describe('état d’un jour', () => {
  const today = '2026-11-11';
  it('distingue fermé, à venir, atteint, manqué, en cours, inconnu', () => {
    expect(dayStatus(day('2026-11-09', { open: false }), today)).toBe('closed');
    expect(dayStatus(day('2026-11-20'), today)).toBe('upcoming');
    expect(dayStatus(day('2026-11-05', { reached: true }), today)).toBe(
      'reached'
    );
    expect(dayStatus(day('2026-11-05', { reached: false }), today)).toBe(
      'missed'
    );
    expect(dayStatus(day(today, { reached: false }), today)).toBe('pending');
    expect(dayStatus(day('2026-11-05', { reached: null }), today)).toBe(
      'unknown'
    );
  });
});

describe('résumé du mois', () => {
  it('compte les jours échus atteints et les cumuls jusqu’à aujourd’hui', () => {
    const s = summarizeMonth(november('2026-11-11'), '2026-11-11');
    // Jours ouvrés échus : 1,3,4,5,6,7,8,10 = 8 (le 2, 9 fermés ; le 11 = aujourd’hui)
    expect(s.elapsedOpenDays).toBe(8);
    expect(s.reachedDays).toBe(8);
    expect(s.openDays).toBe(25);
    expect(s.revenueToDate).toBe(30_000 * 9); // jusqu’au 11 inclus (9 jours ouvrés)
    expect(s.fixedCostMonth).toBe(25 * 10_000);
  });

  it('marge inconnue : cumul du seuil et du résultat indéterminés', () => {
    const days = [
      day('2026-11-03', { breakEven: null, result: null, reached: null }),
    ];
    const s = summarizeMonth(days, '2026-11-11');
    expect(s.breakEvenToDate).toBeNull();
    expect(s.resultToDate).toBeNull();
  });
});

describe('projection de fin de mois', () => {
  it('extrapole au rythme moyen des jours ouvrés échus', () => {
    const p = projectMonthEnd(november('2026-11-11'), '2026-11-11', 0.6);
    // 8 jours échus à 30 000 + aujourd’hui (max(30 000, moyenne)) + 16 jours ouvrés à venir
    expect(p?.avgRevenuePerOpenDay).toBe(30_000);
    expect(p?.projectedRevenue).toBe(30_000 * 25);
    expect(p?.projectedResult).toBe(
      Math.round(30_000 * 25 * 0.6 - 25 * 10_000)
    );
  });

  it('refuse de projeter sans recul, hors du mois courant ou sans marge', () => {
    expect(
      projectMonthEnd(november('2026-11-04'), '2026-11-04', 0.6)
    ).toBeNull();
    expect(
      projectMonthEnd(november('2026-11-11'), '2026-12-02', 0.6)
    ).toBeNull();
    expect(
      projectMonthEnd(november('2026-11-11'), '2026-11-11', null)
    ).toBeNull();
  });
});
