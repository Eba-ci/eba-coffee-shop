// lib/fixed-costs/category-sync.ts
//
// Import des catégories de dépenses FIXED en charges fixes (#433).
//
// La prise d'effet est le MOIS DE LA PREMIÈRE dépense de la catégorie : c'est
// ce qui rend l'historique visible dans l'échéancier (mois payés comme mois
// impayés). Le montant reste celui de la dernière dépense connue (montant
// unique, décision du 14/11).

import prisma from '@/lib/prisma';
import {
  formatLocalDateOnly,
  parseDateOnlyToUTC,
  startOfMonthDateString,
  todayDateString,
} from '@/lib/timezone';
import { planCategoryImport } from './category-import';

export type CategorySyncResult = {
  created: number;
  /** Catégories sans montant connu : à créer à la main (montant à saisir). */
  toComplete: string[];
  skippedSalary: string[];
  alreadyLinked: number;
};

type ExpenseRow = {
  categoryId: string;
  date: Date;
  amount: number;
  note: string | null;
};

/**
 * Une charge fixe MENSUELLE par catégorie FIXED non supprimée (hors Salaires),
 * prise d'effet = premier jour du mois de la première dépense connue (mois
 * courant en dernier recours), montant = dernière dépense connue.
 * Idempotent : `importedCategoryId` est unique (+ `skipDuplicates`). Aucun
 * montant ni jour de paiement n'est inventé.
 */
export async function syncFixedCostsFromCategories(): Promise<CategorySyncResult> {
  const [categories, linked] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { nature: 'FIXED', deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.fixedCost.findMany({
      where: { importedCategoryId: { not: null } },
      select: { importedCategoryId: true },
    }),
  ]);

  const categoryIds = categories.map((c) => c.id);
  // Une seule lecture pour toutes les catégories (tri ascendant : la première
  // ligne d'une catégorie est sa première dépense, la dernière sa dernière).
  const expenses: ExpenseRow[] =
    categoryIds.length === 0
      ? []
      : await prisma.expense.findMany({
          where: { categoryId: { in: categoryIds }, salaryPaymentId: null },
          select: { categoryId: true, date: true, amount: true, note: true },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        });

  const first = new Map<string, ExpenseRow>();
  const last = new Map<string, ExpenseRow>();
  for (const e of expenses) {
    if (!first.has(e.categoryId)) first.set(e.categoryId, e);
    last.set(e.categoryId, e);
  }

  const currentMonth = startOfMonthDateString(todayDateString()).slice(0, 7);
  const plan = planCategoryImport(
    categories.map((c) => {
      const f = first.get(c.id);
      const l = last.get(c.id);
      return {
        ...c,
        lastAmount: l?.amount ?? null,
        lastNote: l?.note ?? null,
        firstExpenseMonth: f
          ? formatLocalDateOnly(f.date).slice(0, 7)
          : null,
      };
    }),
    new Set(linked.map((l) => l.importedCategoryId!)),
    currentMonth
  );

  const max = await prisma.fixedCost.aggregate({ _max: { sortOrder: true } });
  const base = (max._max.sortOrder ?? -1) + 1;
  const res = await prisma.fixedCost.createMany({
    data: plan.toImport.map((r, i) => ({
      label: r.label,
      amount: r.amount,
      periodicity: 'MONTHLY' as const,
      startDate: parseDateOnlyToUTC(`${r.startMonth}-01`)!,
      categoryId: r.categoryId,
      importedCategoryId: r.categoryId,
      sortOrder: base + i,
    })),
    skipDuplicates: true,
  });
  return {
    created: res.count,
    toComplete: plan.toComplete,
    skippedSalary: plan.skippedSalary,
    alreadyLinked: plan.alreadyLinked,
  };
}