// lib/fixed-costs/missing.ts
//
// Alerte « période non enregistrée » : pour chaque charge fixe active, on liste
// les périodes ÉCHUES (depuis la prise d'effet) où aucune dépense de sa
// catégorie n'a été saisie. La période en cours n'alerte jamais (« à venir »).
// Partie pure ici ; la requête est dans `queries.ts`.

import type { FixedCostLike } from './compute';
import { nextPeriodStart, periodContaining } from './periods';

export type MissingPeriod = {
  costId: string;
  label: string;
  categoryId: string;
  periodStart: string;
  periodEnd: string;
};

export type FixedCostWithCategory = FixedCostLike & { categoryId: string };

/** Garde-fou : on ne remonte pas plus loin que 24 périodes par charge. */
const MAX_PERIODS_PER_COST = 24;

/**
 * `expenseDaysByCategory` : jours (YYYY-MM-DD) où au moins une dépense existe,
 * par catégorie. Les périodes sont celles du calendrier ; une charge qui
 * démarre en cours de période est attendue sur cette période-là aussi.
 */
export function findMissingPeriods(
  costs: FixedCostWithCategory[],
  expenseDaysByCategory: Map<string, string[]>,
  today: string
): MissingPeriod[] {
  const out: MissingPeriod[] = [];
  for (const cost of costs) {
    if (!cost.active || cost.periodicity === 'DAILY') continue;
    const days = expenseDaysByCategory.get(cost.categoryId) ?? [];
    const last = cost.endDate && cost.endDate < today ? cost.endDate : today;
    let period = periodContaining(cost.startDate, cost.periodicity);
    const found: MissingPeriod[] = [];
    // Une période est échue quand sa fin est strictement avant aujourd'hui.
    while (period.end < today && period.start <= last) {
      const hasExpense = days.some((d) => d >= period.start && d <= period.end);
      if (!hasExpense) {
        found.push({
          costId: cost.id,
          label: cost.label,
          categoryId: cost.categoryId,
          periodStart: period.start,
          periodEnd: period.end,
        });
      }
      period = periodContaining(nextPeriodStart(period.end), cost.periodicity);
    }
    out.push(...found.slice(-MAX_PERIODS_PER_COST));
  }
  return out;
}
