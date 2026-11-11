// lib/fixed-costs/mutations.ts
//
// Écritures des charges fixes + import depuis les dépenses récurrentes.

import prisma from '@/lib/prisma';
import {
  parseDateOnlyToUTC,
  startOfMonthDateString,
  todayDateString,
} from '@/lib/timezone';
import {
  fixedCostInputSchema,
  fixedCostUpdateSchema,
} from '@/lib/schemas/fixed-cost';

const date = (v: string) => parseDateOnlyToUTC(v)!;

export async function createFixedCost(input: unknown) {
  const d = fixedCostInputSchema.parse(input);
  const max = await prisma.fixedCost.aggregate({ _max: { sortOrder: true } });
  return prisma.fixedCost.create({
    data: {
      label: d.label,
      amount: d.amount,
      periodicity: d.periodicity,
      startDate: date(d.startDate),
      endDate: d.endDate ? date(d.endDate) : null,
      categoryId: d.categoryId,
      active: d.active ?? true,
      note: d.note ?? null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateFixedCost(id: string, input: unknown) {
  const d = fixedCostUpdateSchema.parse(input);
  if (d.startDate || d.endDate !== undefined) {
    // La contrainte fin ≥ début se vérifie aussi contre la valeur déjà en base.
    const cur = await prisma.fixedCost.findUniqueOrThrow({ where: { id } });
    const start = d.startDate ?? cur.startDate.toISOString().slice(0, 10);
    const end =
      d.endDate !== undefined
        ? d.endDate
        : (cur.endDate?.toISOString().slice(0, 10) ?? null);
    if (end && end < start)
      throw new Error('La fin doit être après la prise d’effet');
  }
  return prisma.fixedCost.update({
    where: { id },
    data: {
      ...(d.label !== undefined ? { label: d.label } : {}),
      ...(d.amount !== undefined ? { amount: d.amount } : {}),
      ...(d.periodicity !== undefined ? { periodicity: d.periodicity } : {}),
      ...(d.startDate !== undefined ? { startDate: date(d.startDate) } : {}),
      ...(d.endDate !== undefined
        ? { endDate: d.endDate ? date(d.endDate) : null }
        : {}),
      ...(d.categoryId !== undefined ? { categoryId: d.categoryId } : {}),
      ...(d.active !== undefined ? { active: d.active } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
}

export async function deleteFixedCost(id: string) {
  return prisma.fixedCost.delete({ where: { id } });
}

export type SyncResult = {
  created: number;
  /** Récurrentes actives sans montant attendu : à compléter à la main. */
  skippedNoAmount: string[];
  /** Récurrentes déjà reprises (rien à faire). */
  alreadyLinked: number;
};

/**
 * Crée une charge fixe pour chaque dépense récurrente ACTIVE qui n'en a pas
 * encore. Idempotent (`recurringExpenseId` unique) ; ne touche jamais une
 * charge déjà liée. Périodicité MENSUELLE, prise d'effet = 1er du mois courant.
 */
export async function syncFixedCostsFromRecurring(): Promise<SyncResult> {
  const [recurring, linked] = await Promise.all([
    prisma.recurringExpense.findMany({
      where: { active: true },
      orderBy: { label: 'asc' },
    }),
    prisma.fixedCost.findMany({
      where: { recurringExpenseId: { not: null } },
      select: { recurringExpenseId: true },
    }),
  ]);
  const linkedIds = new Set(linked.map((l) => l.recurringExpenseId));
  const todo = recurring.filter((r) => !linkedIds.has(r.id));
  const withAmount = todo.filter(
    (r) => r.expectedAmount && r.expectedAmount > 0
  );
  const startDate = date(startOfMonthDateString(todayDateString()));
  const max = await prisma.fixedCost.aggregate({ _max: { sortOrder: true } });
  const base = (max._max.sortOrder ?? -1) + 1;

  const res = await prisma.fixedCost.createMany({
    data: withAmount.map((r, i) => ({
      label: r.label,
      amount: r.expectedAmount!,
      periodicity: 'MONTHLY' as const,
      startDate,
      categoryId: r.categoryId,
      recurringExpenseId: r.id,
      sortOrder: base + i,
    })),
    skipDuplicates: true,
  });
  return {
    created: res.count,
    skippedNoAmount: todo.filter((r) => !r.expectedAmount).map((r) => r.label),
    alreadyLinked: recurring.length - todo.length,
  };
}
