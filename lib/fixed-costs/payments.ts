// lib/fixed-costs/payments.ts
//
// Logique PURE du calendrier des paiements : regroupement des échéances par
// jour, grille du mois, semaine en cours, statut dominant d'une case et résumé.
// Rien ici ne touche la base ; les occurrences viennent de `schedule.ts`.

import { shiftDateString } from '@/lib/timezone';
import { monthBounds } from './month';
import { eachDay, weekdayOf } from './periods';
import type { Occurrence, OccurrenceStatus } from './schedule';

/** Semaine civile (lundi → dimanche) qui contient `day`. */
export function weekBounds(day: string): { from: string; to: string } {
  const monday = shiftDateString(day, -((weekdayOf(day) + 6) % 7));
  return { from: monday, to: shiftDateString(monday, 6) };
}

/** Une case du mois : un jour civil (jamais nul dans cette vue). */
export type PaymentCell = { date: string };

/**
 * Semaines lun→dim du mois `YYYY-MM`. Une case = un jour civil, ou `null`
 * pour les blancs avant le 1er et après le dernier jour.
 */
export function buildPaymentGrid(month: string): (PaymentCell | null)[][] {
  const { from, to } = monthBounds(month);
  const days: PaymentCell[] = eachDay(from, to).map((date) => ({ date }));
  const lead = (weekdayOf(from) + 6) % 7;
  const cells: (PaymentCell | null)[] = [
    ...Array<null>(lead).fill(null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (PaymentCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Regroupe des occurrences par jour d'échéance. */
export function groupByDueDate(
  occurrences: Occurrence[]
): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const list = map.get(o.dueDate) ?? [];
    list.push(o);
    map.set(o.dueDate, list);
  }
  return map;
}

/** Échéances qui ne sont pas entièrement réglées. */
export function unpaid(occurrences: Occurrence[]): Occurrence[] {
  return occurrences.filter((o) => o.status !== 'PAID');
}

/** Total dû (montant des échéances) sur un jeu d'occurrences. */
export function sumAmount(occurrences: Occurrence[]): number {
  return occurrences.reduce((s, o) => s + o.amount, 0);
}

/**
 * Statut dominant d'une case : le plus urgent l'emporte (en retard > partiel >
 * à venir > payé). `null` pour une case sans échéance.
 */
const URGENCY: Record<OccurrenceStatus, number> = {
  LATE: 0,
  PARTIAL: 1,
  UPCOMING: 2,
  PAID: 3,
};

export function dominantStatus(
  occurrences: Occurrence[]
): OccurrenceStatus | null {
  let best: OccurrenceStatus | null = null;
  for (const o of occurrences)
    if (best === null || URGENCY[o.status] < URGENCY[best]) best = o.status;
  return best;
}

export type PaymentsSummary = {
  count: number;
  /** Montant total dû sur la période. */
  due: number;
  paid: number;
  remaining: number;
  lateCount: number;
  upcomingCount: number;
  partialCount: number;
  paidCount: number;
};

export function summarizeOccurrences(
  occurrences: Occurrence[]
): PaymentsSummary {
  const summary: PaymentsSummary = {
    count: occurrences.length,
    due: 0,
    paid: 0,
    remaining: 0,
    lateCount: 0,
    upcomingCount: 0,
    partialCount: 0,
    paidCount: 0,
  };
  for (const o of occurrences) {
    summary.due += o.amount;
    summary.paid += o.paid;
    summary.remaining += o.remaining;
    if (o.status === 'LATE') summary.lateCount++;
    else if (o.status === 'UPCOMING') summary.upcomingCount++;
    else if (o.status === 'PARTIAL') summary.partialCount++;
    else summary.paidCount++;
  }
  return summary;
}
