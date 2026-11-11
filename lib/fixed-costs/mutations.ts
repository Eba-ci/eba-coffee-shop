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

import { installmentsError } from './installments';

const date = (v: string) => parseDateOnlyToUTC(v)!;

function assertInstallments(
  periodicity: Parameters<typeof installmentsError>[0],
  amount: number,
  installments: Parameters<typeof installmentsError>[2]
) {
  const err = installmentsError(periodicity, amount, installments);
  if (err) throw new Error(err);
}

export async function createFixedCost(input: unknown) {
  const d = fixedCostInputSchema.parse(input);
  const installments = d.installments ?? [];
  assertInstallments(d.periodicity, d.amount, installments);
  const max = await prisma.fixedCost.aggregate({ _max: { sortOrder: true } });
  return prisma.fixedCost.create({
    data: {
      installments: { create: installments },
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
  const cur = await prisma.fixedCost.findUniqueOrThrow({
    where: { id },
    include: { installments: true },
  });
  // La contrainte fin ≥ début se vérifie aussi contre la valeur déjà en base.
  const start = d.startDate ?? cur.startDate.toISOString().slice(0, 10);
  const end =
    d.endDate !== undefined
      ? d.endDate
      : (cur.endDate?.toISOString().slice(0, 10) ?? null);
  if (end && end < start)
    throw new Error('La fin doit être après la prise d’effet');

  // Échéances : on valide l'état FINAL. Changer montant ou périodicité sans
  // renvoyer les échéances les laisserait incohérentes → on le refuse.
  const periodicity = d.periodicity ?? cur.periodicity;
  const amount = d.amount ?? cur.amount;
  const installments =
    d.installments ??
    cur.installments.map((i) => ({
      monthOffset: i.monthOffset,
      day: i.day,
      amount: i.amount,
    }));
  assertInstallments(periodicity, amount, installments);

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
      ...(d.installments !== undefined
        ? {
            installments: {
              deleteMany: {},
              create: d.installments,
            },
          }
        : {}),
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
