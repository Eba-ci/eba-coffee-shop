// lib/fixed-costs/expense-margin-query.ts — lecture du total des dépenses
// variables d'une plage (cf. expense-margin.ts).

import { SALARY_EXPENSE_CATEGORY_NAME } from '@/config/constants';
import prisma from '@/lib/prisma';

/**
 * Somme des dépenses « d'achat courant » sur [from, to] (jours civils). Sont
 * exclues, car ce ne sont pas des coûts variables : les dépenses qui règlent
 * une charge fixe ou un salaire, les catégories de nature FIXE, la catégorie
 * des salaires et toute catégorie rattachée à une charge fixe active (un loyer
 * saisi à l'ancienne, sans lien, y échappe donc aussi).
 */
export async function getVariableExpenseTotal(
  from: Date,
  to: Date
): Promise<number> {
  const agg = await prisma.expense.aggregate({
    _sum: { amount: true },
    where: {
      date: { gte: from, lte: to },
      fixedCostId: null,
      salaryPaymentId: null,
      category: {
        nature: 'VARIABLE',
        name: { not: SALARY_EXPENSE_CATEGORY_NAME },
        fixedCosts: { none: { active: true } },
      },
    },
  });
  return agg._sum.amount ?? 0;
}
