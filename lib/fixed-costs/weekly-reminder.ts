// lib/fixed-costs/weekly-reminder.ts
//
// Rappel « À payer cette semaine » du dashboard : logique PURE. Part des
// échéances de la semaine (`getPaymentsView().week`) et ne garde que ce qui
// reste à régler. Aucune donnée de salaire : les échéances viennent des seules
// charges fixes, et le total global des salaires n'entre jamais ici.

import { summarizeOccurrences, unpaid, weekBounds } from './payments';
import type { Occurrence } from './schedule';

export type WeeklyReminder = {
  from: string;
  to: string;
  count: number;
  /** Montant total restant à régler sur la semaine. */
  remaining: number;
  items: Occurrence[];
};

export function buildWeeklyReminder(
  week: Occurrence[],
  today: string
): WeeklyReminder {
  const { from, to } = weekBounds(today);
  const items = unpaid(week)
    .filter((o) => o.dueDate >= from && o.dueDate <= to)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.label.localeCompare(b.label)
    );
  return {
    from,
    to,
    count: items.length,
    remaining: summarizeOccurrences(items).remaining,
    items,
  };
}

/** Mois `YYYY-MM` de la date du jour (clé de `getPaymentsView`). */
export const monthOf = (day: string): string => day.slice(0, 7);
