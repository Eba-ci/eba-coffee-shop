// lib/fixed-costs/history-queries.ts
//
// Lecture de la détection d'historique (#451) : UNE seule requête Prisma, les
// dépenses de chaque catégorie étant chargées avec la catégorie (pas de N+1).
// L'analyse vit dans `history-detection.ts` (pure) ; ce module ne fait que
// lire, jamais écrire.

import prisma from '@/lib/prisma';
import { formatLocalDateOnly, todayDateString } from '@/lib/timezone';
import {
  detectFixedCostHistory,
  type CategoryHistory,
  type HistoryExpense,
} from './history-detection';

/**
 * Catégories FIXED non supprimées et leurs dépenses réelles, versées à la
 * détection. `salaryPaymentId: null` exclut les lignes de salaire ; la
 * catégorie « Salaires » est écartée en aval par le prédicat partagé.
 *
 * `referenceMonth` sert uniquement aux mois sans dépense APRÈS le dernier mois
 * connu ; par défaut, le mois courant.
 */
export async function getFixedCostHistory(
  referenceMonth: string = todayDateString().slice(0, 7)
): Promise<CategoryHistory[]> {
  const rows = await prisma.expenseCategory.findMany({
    where: { nature: 'FIXED', deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      fixedCosts: { select: { id: true } },
      expenses: {
        where: { salaryPaymentId: null },
        select: { date: true, amount: true },
        orderBy: { date: 'asc' },
      },
    },
  });

  const expensesByCategory: Record<string, HistoryExpense[]> = {};
  const categories = rows.map((row) => {
    expensesByCategory[row.id] = row.expenses.map((expense) => ({
      date: formatLocalDateOnly(expense.date),
      amount: expense.amount,
    }));
    return {
      id: row.id,
      name: row.name,
      hasFixedCost: row.fixedCosts.length > 0,
    };
  });

  return detectFixedCostHistory(categories, expensesByCategory, referenceMonth);
}
