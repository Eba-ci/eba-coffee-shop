// lib/fixed-costs/periods.ts
//
// Calcul pur de périodes sur des jours civils `YYYY-MM-DD` (Abidjan, UTC+0 :
// l'arithmétique UTC suffit). Aucune dépendance serveur.

import type { FixedCostPeriodicity } from '@/generated/prisma/enums';

export type Period = { start: string; end: string };

const pad = (n: number) => String(n).padStart(2, '0');

function toUtc(day: string): Date {
  return new Date(
    Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      Number(day.slice(8, 10))
    )
  );
}

function fromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(day: string, delta: number): string {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + delta);
  return fromUtc(d);
}

/** Jour de la semaine, 0 = dimanche … 6 = samedi (même convention que `weeklyHours`). */
export function weekdayOf(day: string): number {
  return toUtc(day).getUTCDay();
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Période (de calendrier) de la périodicité qui contient `day`. */
export function periodContaining(
  day: string,
  periodicity: FixedCostPeriodicity
): Period {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  switch (periodicity) {
    case 'DAILY':
      return { start: day, end: day };
    case 'WEEKLY': {
      // Semaine du lundi au dimanche.
      const offset = (weekdayOf(day) + 6) % 7;
      const start = addDays(day, -offset);
      return { start, end: addDays(start, 6) };
    }
    case 'MONTHLY':
      return {
        start: `${year}-${pad(month)}-01`,
        end: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`,
      };
    case 'QUARTERLY': {
      const first = Math.floor((month - 1) / 3) * 3 + 1;
      const last = first + 2;
      return {
        start: `${year}-${pad(first)}-01`,
        end: `${year}-${pad(last)}-${pad(daysInMonth(year, last))}`,
      };
    }
    case 'YEARLY':
      return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
}

/** Période qui suit celle qui se termine à `end`. */
export function nextPeriodStart(end: string): string {
  return addDays(end, 1);
}

/** Jours `YYYY-MM-DD` de `start` à `end` inclus. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
