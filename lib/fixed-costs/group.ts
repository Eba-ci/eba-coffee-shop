// lib/fixed-costs/group.ts
//
// Regroupement des échéances en retard par mois d'échéance (#458). Pur : on
// regroupe ce qui est déjà chargé, sans toucher à la requête ni à la fenêtre.

import type { Occurrence } from './schedule';
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

export type MonthGroup = {
  /** `YYYY-MM` du jour d'échéance. */
  month: string;
  occurrences: Occurrence[];
  count: number;
  /** Somme des restes à payer du mois. */
  remaining: number;
};

/** Du mois le plus récent au plus ancien ; dans un mois, par jour croissant. */
export function groupOccurrencesByMonth(
  occurrences: Occurrence[]
): MonthGroup[] {
  const byMonth = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const m = o.dueDate.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), o]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => {
      const sorted = [...list].sort((x, y) =>
        x.dueDate.localeCompare(y.dueDate)
      );
      return {
        month,
        occurrences: sorted,
        count: sorted.length,
        remaining: sorted.reduce((s, o) => s + o.remaining, 0),
      };
    });
}

/** « novembre 2026 » depuis `2026-11`. */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? month} ${y}`;
}
