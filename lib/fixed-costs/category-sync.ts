// lib/fixed-costs/category-sync.ts
//
// Import des catégories de dépenses FIXED en charges fixes (#433).

import prisma from '@/lib/prisma';
import {
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

/**
 * Une charge fixe MENSUELLE par catégorie FIXED non supprimée (hors Salaires),
 * prise d'effet = 1er du mois courant, montant = dernière dépense connue.
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
  const last = await Promise.all(
    categories.map((c) =>
      prisma.expense.findFirst({
        where: { categoryId: c.id, salaryPaymentId: null },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        select: { amount: true },
      })
    )
  );
  const plan = planCategoryImport(
    categories.map((c, i) => ({ ...c, lastAmount: last[i]?.amount ?? null })),
    new Set(linked.map((l) => l.importedCategoryId!))
  );

  const startDate = parseDateOnlyToUTC(
    startOfMonthDateString(todayDateString())
  )!;
  const max = await prisma.fixedCost.aggregate({ _max: { sortOrder: true } });
  const base = (max._max.sortOrder ?? -1) + 1;
  const res = await prisma.fixedCost.createMany({
    data: plan.toImport.map((r, i) => ({
      label: r.label,
      amount: r.amount,
      periodicity: 'MONTHLY' as const,
      startDate,
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
