// lib/fixed-costs/month.ts
//
// Logique PURE du suivi par mois : navigation (`YYYY-MM`), grille de
// calendrier, état d'un jour, résumé du mois et projection de fin de mois.
// Rien ici ne touche la base ; les jours viennent de `buildBreakEvenSeries`.

import type { BreakEvenDay } from './compute';
import { daysInMonth, weekdayOf } from './periods';

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Mois `YYYY-MM` valide, sinon le mois de `today` (valeur d'URL invalide). */
export function parseMonth(
  value: string | null | undefined,
  today: string
): string {
  return value && MONTH_RE.test(value) ? value : today.slice(0, 7);
}

export function monthBounds(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    from: `${month}-01`,
    to: `${month}-${String(daysInMonth(year, m)).padStart(2, '0')}`,
  };
}

export function shiftMonth(month: string, delta: number): string {
  const index =
    Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Mois proposés par le sélecteur : `back` avant, `forward` après `current`. */
export function listMonthOptions(
  current: string,
  back = 12,
  forward = 3
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let d = -back; d <= forward; d++) {
    const value = shiftMonth(current, d);
    out.push({ value, label: monthLabel(value) });
  }
  return out;
}

export type DayStatus =
  | 'reached' // seuil atteint
  | 'missed' // seuil non atteint (jour échu)
  | 'pending' // aujourd'hui, seuil pas encore atteint
  | 'closed'
  | 'upcoming'
  | 'unknown'; // marge inconnue : pas de verdict

export function dayStatus(day: BreakEvenDay, today: string): DayStatus {
  if (!day.open) return 'closed';
  if (day.date > today) return 'upcoming';
  if (day.reached === null) return 'unknown';
  if (day.reached) return 'reached';
  return day.date === today ? 'pending' : 'missed';
}

/** Semaines lun→dim ; `null` = case hors du mois. */
export function buildCalendarGrid(
  days: BreakEvenDay[]
): (BreakEvenDay | null)[][] {
  if (days.length === 0) return [];
  const lead = (weekdayOf(days[0].date) + 6) % 7;
  const cells: (BreakEvenDay | null)[] = [
    ...Array<null>(lead).fill(null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (BreakEvenDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type MonthSummary = {
  openDays: number;
  /** Jours ouvrés strictement avant aujourd'hui. */
  elapsedOpenDays: number;
  reachedDays: number;
  /** CA net cumulé jusqu'à aujourd'hui inclus. */
  revenueToDate: number;
  /** Point mort cumulé des jours ouvrés jusqu'à aujourd'hui inclus. */
  breakEvenToDate: number | null;
  fixedCostMonth: number;
  /** Résultat estimé cumulé jusqu'à aujourd'hui inclus (null si marge inconnue). */
  resultToDate: number | null;
};

export function summarizeMonth(
  days: BreakEvenDay[],
  today: string
): MonthSummary {
  const upToToday = days.filter((d) => d.date <= today);
  const elapsed = days.filter((d) => d.open && d.date < today);
  const breakEvens = upToToday.filter((d) => d.open).map((d) => d.breakEven);
  const results = upToToday.map((d) => d.result);
  return {
    openDays: days.filter((d) => d.open).length,
    elapsedOpenDays: elapsed.length,
    reachedDays: elapsed.filter((d) => d.reached === true).length,
    revenueToDate: upToToday.reduce((a, d) => a + d.revenue, 0),
    breakEvenToDate: breakEvens.some((b) => b === null)
      ? null
      : breakEvens.reduce<number>((a, b) => a + (b ?? 0), 0),
    fixedCostMonth: days.reduce((a, d) => a + d.fixedCost, 0),
    resultToDate: results.some((r) => r === null)
      ? null
      : results.reduce<number>((a, r) => a + (r ?? 0), 0),
  };
}

/** Recul minimal (jours ouvrés échus) pour oser une projection. */
export const MIN_PROJECTION_DAYS = 3;

export type MonthProjection = {
  avgRevenuePerOpenDay: number;
  projectedRevenue: number;
  monthBreakEven: number;
  projectedResult: number;
};

/**
 * Projection de fin de mois AU RYTHME ACTUEL : CA des jours échus + moyenne par
 * jour ouvré pour aujourd'hui (au moins ce qui est déjà fait) et les jours à
 * venir. `null` hors du mois courant, sous `MIN_PROJECTION_DAYS` jours échus,
 * ou si la marge est inconnue. C'est une estimation, pas un engagement.
 */
export function projectMonthEnd(
  days: BreakEvenDay[],
  today: string,
  marginRate: number | null
): MonthProjection | null {
  if (marginRate === null || days.length === 0) return null;
  if (today < days[0].date || today > days[days.length - 1].date) return null;
  const elapsed = days.filter((d) => d.open && d.date < today);
  if (elapsed.length < MIN_PROJECTION_DAYS) return null;
  const avg = elapsed.reduce((a, d) => a + d.revenue, 0) / elapsed.length;
  let projectedRevenue = elapsed.reduce((a, d) => a + d.revenue, 0);
  // Jours échus fermés mais avec du CA : acquis, hors moyenne.
  projectedRevenue += days
    .filter((d) => !d.open && d.date < today)
    .reduce((a, d) => a + d.revenue, 0);
  for (const d of days.filter((x) => x.date >= today)) {
    if (!d.open) projectedRevenue += d.revenue;
    else projectedRevenue += d.date === today ? Math.max(d.revenue, avg) : avg;
  }
  const monthBreakEven = days.reduce((a, d) => a + (d.breakEven ?? 0), 0);
  const fixedCostMonth = days.reduce((a, d) => a + d.fixedCost, 0);
  return {
    avgRevenuePerOpenDay: Math.round(avg),
    projectedRevenue: Math.round(projectedRevenue),
    monthBreakEven,
    projectedResult: Math.round(projectedRevenue * marginRate - fixedCostMonth),
  };
}
