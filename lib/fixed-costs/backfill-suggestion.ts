// lib/fixed-costs/backfill-suggestion.ts
//
// Proposition PURE de formulaire de backfill, tirée de la détection (#452).
// Le formulaire reçoit cette proposition : il ne recalcule pas l'historique.

import type { CategoryHistory } from './history-detection';

export type BackfillSuggestion = {
  categoryId: string;
  label: string;
  /** Total RÉEL du dernier mois couvert (modifiable) : jamais une estimation. */
  amount: number;
  /** Prise d'effet proposée : le 1er du mois de la première dépense. */
  startDate: string;
  periodicity: 'MONTHLY';
  /** Mois `YYYY-MM` de la première dépense, pour l'avertissement du formulaire. */
  firstMonth: string;
  alreadyConverted: boolean;
};

export function suggestBackfill(history: CategoryHistory): BackfillSuggestion {
  const last = history.months[history.months.length - 1];
  return {
    categoryId: history.categoryId,
    label: history.categoryName,
    amount: last?.total ?? 0,
    startDate: `${history.suggestedStartMonth}-01`,
    periodicity: history.suggestedPeriodicity,
    firstMonth: history.firstMonth,
    alreadyConverted: history.alreadyConverted,
  };
}

/** Avertissement affiché quand la prise d'effet choisie dépasse la première dépense. */
export function startAfterFirstMonthNotice(
  startDate: string,
  firstMonth: string
): string | null {
  return startDate.slice(0, 7) > firstMonth
    ? `La première dépense date de ${firstMonth} : l’historique antérieur à ${startDate.slice(0, 7)} restera hors périmètre.`
    : null;
}
