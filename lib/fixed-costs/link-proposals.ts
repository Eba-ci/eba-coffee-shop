// lib/fixed-costs/link-proposals.ts
//
// Propositions PURES de rapprochement dépense ↔ échéance (#453). Aucune
// écriture, aucune base : l'outil PROPOSE, l'admin confirme. Même catégorie,
// dépense tombée dans la période de l'échéance, montant identique ou proche.

import type { Occurrence } from './schedule';

/** Dépense candidate : non liée, hors salaire, déjà filtrée côté lecture. */
export type LinkableExpense = {
  id: string;
  /** Jour civil `YYYY-MM-DD`. */
  date: string;
  amount: number;
  categoryId: string;
};

export type LinkProposal = {
  expenseId: string;
  costId: string;
  occurrenceDueDate: string;
  /** 0..1 : 1 = montant identique ; décroît avec l'écart relatif. */
  score: number;
  /** Montant de la dépense − montant de l'échéance (signé, FCFA). */
  delta: number;
};

/** Sous ce score, l'écart de montant est trop grand pour être proposé. */
export const MIN_LINK_SCORE = 0.5;

function scoreOf(amount: number, due: number): number {
  const max = Math.max(amount, due);
  return max === 0 ? 0 : Math.max(0, 1 - Math.abs(amount - due) / max);
}

const daysApart = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));

/**
 * Une proposition au plus par dépense (la meilleure). Les échéances déjà
 * entièrement réglées ne sont pas proposées (un lien manuel reste possible :
 * l'excédent est assumé). Classées par score décroissant, puis par date.
 */
export function proposeOccurrenceLinks(
  expenses: readonly LinkableExpense[],
  occurrences: readonly Occurrence[]
): LinkProposal[] {
  const open = occurrences.filter((o) => o.remaining > 0);
  const out: LinkProposal[] = [];
  for (const expense of expenses) {
    let best: (LinkProposal & { gap: number }) | null = null;
    for (const occ of open) {
      if (occ.categoryId !== expense.categoryId) continue;
      if (expense.date < occ.periodStart || expense.date > occ.periodEnd)
        continue;
      const score = scoreOf(expense.amount, occ.amount);
      if (score < MIN_LINK_SCORE) continue;
      const gap = daysApart(expense.date, occ.dueDate);
      if (
        !best ||
        score > best.score ||
        (score === best.score && gap < best.gap)
      )
        best = {
          expenseId: expense.id,
          costId: occ.costId,
          occurrenceDueDate: occ.dueDate,
          score,
          delta: expense.amount - occ.amount,
          gap,
        };
    }
    if (best) {
      const { gap, ...proposal } = best;
      void gap;
      out.push(proposal);
    }
  }
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      a.occurrenceDueDate.localeCompare(b.occurrenceDueDate) ||
      a.expenseId.localeCompare(b.expenseId)
  );
}
