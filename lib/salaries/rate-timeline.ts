// lib/salaries/rate-timeline.ts
//
// Frise chronologique des taux d'un employé (pur, sans accès base). Une étape
// par taux, du plus ancien au plus récent : date d'effet, montant, écart avec
// le taux précédent, et période couverte (jusqu'à la veille du taux suivant, de
// la sortie ou « en cours »). Aucun calcul de paie : le dû vient du journal.

import { compareStrings } from './month';

export type RateStep = {
  startDate: string;
  monthlyAmount: number;
  /** Écart en FCFA avec le taux précédent (null pour le premier). */
  delta: number | null;
  /** Écart relatif arrondi à l'entier (null pour le premier ou base nulle). */
  deltaPct: number | null;
  /** Dernier jour couvert (veille du taux suivant ou sortie) ; null = en cours. */
  endDate: string | null;
  /** Taux en vigueur à `today`. */
  current: boolean;
  /** Taux futur (pas encore commencé à `today`). */
  upcoming: boolean;
};

function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function buildRateTimeline(
  rates: { monthlyAmount: number; startDate: string }[],
  employeeEndDate: string | null,
  today: string
): RateStep[] {
  const sorted = [...rates].sort((a, b) =>
    compareStrings(a.startDate, b.startDate)
  );
  return sorted.map((rate, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const delta = prev ? rate.monthlyAmount - prev.monthlyAmount : null;
    const deltaPct =
      prev && prev.monthlyAmount > 0
        ? Math.round((delta! / prev.monthlyAmount) * 100)
        : null;
    const endDate = next ? dayBefore(next.startDate) : employeeEndDate;
    const started = rate.startDate <= today;
    const ended = endDate !== null && endDate < today;
    return {
      startDate: rate.startDate,
      monthlyAmount: rate.monthlyAmount,
      delta,
      deltaPct,
      endDate,
      current: started && !ended,
      upcoming: !started,
    };
  });
}
