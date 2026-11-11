// lib/recurring-expenses.ts
//
// Lecture des modèles de dépense récurrente + détection des récurrentes non
// saisies dans le mois civil courant (aide-mémoire, aucune création automatique).
// Les écritures vivent dans lib/recurring-expense-mutations.ts.

import prisma from '@/lib/prisma';
import { parseDateOnlyToUTC, todayDateString } from '@/lib/timezone';

/** Modèles récurrents triés (libellé), avec le nom de leur catégorie. */
export async function listRecurringExpenses() {
  return prisma.recurringExpense.findMany({
    orderBy: [{ label: 'asc' }],
    include: { category: { select: { id: true, name: true } } },
  });
}

/** Bornes [début, début mois suivant[ du mois civil contenant `dateStr`. */
function monthBounds(dateStr: string): { start: Date; nextStart: Date } {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7)); // 1-12
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = parseDateOnlyToUTC(`${year}-${pad(month)}-01`)!;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextStart = parseDateOnlyToUTC(`${nextYear}-${pad(nextMonth)}-01`)!;
  return { start, nextStart };
}

export type MissingRecurring = {
  id: string;
  label: string;
  categoryId: string;
  categoryName: string;
  expectedAmount: number | null;
};

/**
 * Renvoie les modèles récurrents actifs dont AUCUNE dépense de la même catégorie
 * n'a été saisie dans le mois civil courant. Sert à afficher une alerte.
 */
export async function getMissingRecurringExpenses(): Promise<
  MissingRecurring[]
> {
  const { start, nextStart } = monthBounds(todayDateString());

  const [templates, expensesThisMonth] = await Promise.all([
    prisma.recurringExpense.findMany({
      where: { active: true },
      orderBy: [{ label: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
    }),
    prisma.expense.findMany({
      // Une ligne de salaire ne « saisit » pas la dépense récurrente d'une
      // catégorie : on l'exclut du contrôle (le lien `salaryPaymentId` fait foi).
      where: {
        date: { gte: start, lt: nextStart },
        salaryPaymentId: null,
      },
      select: { categoryId: true },
      distinct: ['categoryId'],
    }),
  ]);

  const seenCategories = new Set(expensesThisMonth.map((e) => e.categoryId));
  return templates
    .filter((t) => !seenCategories.has(t.categoryId))
    .map((t) => ({
      id: t.id,
      label: t.label,
      categoryId: t.categoryId,
      categoryName: t.category.name,
      expectedAmount: t.expectedAmount,
    }));
}
