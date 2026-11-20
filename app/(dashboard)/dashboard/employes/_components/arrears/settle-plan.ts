// Règles pures de l'écran « Régler l'arriéré » (aucun accès base, testées).
// Le reste à payer par mois vient du journal (`salaryArrears`), jamais recalculé
// ici ; on ne fait que répartir, dater et vérifier la saisie.

import { nextMonth, shiftMonth } from '@/lib/salaries/month';

export type ArrearsMonth = { month: string; remaining: number };

export type DateChoice = 'first' | 'today' | 'custom';

/** Le 1er du mois SUIVANT le mois couvert (la paie sort le 1er pour le mois d'avant). */
export function firstOfNextMonth(month: string): string {
  return `${nextMonth(month)}-01`;
}

/** Date de versement d'un mois selon le choix de l'écran. */
export function payDateFor(
  month: string,
  choice: DateChoice,
  today: string,
  custom: string
): string {
  if (choice === 'today') return today;
  if (choice === 'custom') return custom || today;
  return firstOfNextMonth(month);
}

/**
 * Sépare « à payer ce mois-ci » (le mois qui vient de se clore, paie normale du
 * 1er) de « arriéré » (les mois plus anciens, vraiment en retard).
 */
export function splitArrears(
  months: ArrearsMonth[],
  currentMonth: string
): { dueNow: ArrearsMonth | null; older: ArrearsMonth[] } {
  const previous = shiftMonth(currentMonth, -1);
  return {
    dueNow: months.find((m) => m.month === previous) ?? null,
    older: months.filter((m) => m.month !== previous),
  };
}

export type SettleLine = { month: string; remaining: number; amount: string };

export type SettleCheck =
  | { ok: true; items: { month: string; date: string; amount: number }[] }
  | { ok: false; error: string };

/** Valide la saisie : montants entiers > 0 et ≤ reste du mois. */
export function checkSettle(
  lines: SettleLine[],
  choice: DateChoice,
  today: string,
  custom: string
): SettleCheck {
  if (lines.length === 0) return { ok: false, error: 'Aucun mois sélectionné' };
  if (choice === 'custom' && !custom) {
    return { ok: false, error: 'Choisissez la date du versement' };
  }
  const items: { month: string; date: string; amount: number }[] = [];
  for (const line of lines) {
    const amount = Number(line.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return { ok: false, error: 'Montant invalide' };
    }
    if (amount > line.remaining) {
      return { ok: false, error: 'Un montant dépasse le reste à payer' };
    }
    items.push({
      month: line.month,
      date: payDateFor(line.month, choice, today, custom),
      amount,
    });
  }
  return { ok: true, items };
}

export const sumAmounts = (items: { amount: number }[]) =>
  items.reduce((a, i) => a + i.amount, 0);
