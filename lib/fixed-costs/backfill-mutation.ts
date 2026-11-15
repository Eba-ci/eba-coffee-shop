// lib/fixed-costs/backfill-mutation.ts
//
// Backfill d'une charge fixe depuis l'historique (#452). Crée la charge avec
// une prise d'effet passée, ou CORRIGE la prise d'effet de celle que la
// catégorie a déjà (clé d'idempotence `importedCategoryId`). Ne crée aucune
// dépense et n'invente aucun montant. Rejouable sans effet.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { fixedCostBackfillSchema } from '@/lib/schemas/fixed-cost';
import {
  formatLocalDateOnly,
  parseDateOnlyToUTC,
  todayDateString,
} from '@/lib/timezone';
import { planBackfillCreate, planBackfillStart } from './backfill';
import { isSalaryNamed } from './salary-migration';

export type BackfillResult = {
  action: 'created' | 'updated' | 'unchanged';
  costId: string;
  startDate: string;
  warning: string | null;
};

const date = (v: string) => parseDateOnlyToUTC(v)!;

export async function backfillFixedCost(
  input: unknown
): Promise<BackfillResult> {
  const d = fixedCostBackfillSchema.parse(input);
  const category = await prisma.expenseCategory.findFirst({
    where: { id: d.categoryId, deletedAt: null },
    select: {
      name: true,
      fixedCosts: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
          importedCategoryId: true,
        },
      },
    },
  });
  if (!category) throw new Error('Catégorie introuvable.');
  if (isSalaryNamed({ label: category.name, categoryName: category.name }))
    throw new Error('La catégorie « Salaires » relève du module Employés.');

  const first = await prisma.expense.findFirst({
    where: { categoryId: d.categoryId, salaryAggregateKey: null },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  const ctx = {
    today: todayDateString(),
    firstDetectedMonth: first
      ? formatLocalDateOnly(first.date).slice(0, 7)
      : null,
  };

  // Charge à corriger : celle importée, sinon l'unique charge de la catégorie.
  const costs = category.fixedCosts;
  const existing =
    costs.find((c) => c.importedCategoryId === d.categoryId) ??
    (costs.length === 1 ? costs[0] : undefined);
  if (!existing && costs.length > 1)
    throw new Error(
      'Cette catégorie porte plusieurs charges : corrige la prise d’effet de la bonne depuis la liste des charges.'
    );

  if (existing) {
    const plan = planBackfillStart(d.startDate, ctx);
    if (!plan.ok) throw new Error(plan.error);
    if (existing.endDate && formatLocalDateOnly(existing.endDate) < d.startDate)
      throw new Error(
        'La prise d’effet ne peut pas dépasser la fin de la charge.'
      );
    const current = formatLocalDateOnly(existing.startDate);
    if (current === d.startDate)
      return {
        action: 'unchanged',
        costId: existing.id,
        startDate: current,
        warning: plan.warning,
      };
    await prisma.fixedCost.update({
      where: { id: existing.id },
      data: { startDate: date(d.startDate) },
    });
    return {
      action: 'updated',
      costId: existing.id,
      startDate: d.startDate,
      warning: plan.warning,
    };
  }

  const plan = planBackfillCreate(d, ctx);
  if (!plan.ok) throw new Error(plan.error);
  const max = await prisma.fixedCost.aggregate({ _max: { sortOrder: true } });
  try {
    const created = await prisma.fixedCost.create({
      data: {
        label: d.label!.trim(),
        amount: d.amount!,
        periodicity: d.periodicity,
        startDate: date(d.startDate),
        categoryId: d.categoryId,
        importedCategoryId: d.categoryId,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        installments: { create: d.installments ?? [] },
      },
    });
    return {
      action: 'created',
      costId: created.id,
      startDate: d.startDate,
      warning: plan.warning,
    };
  } catch (err) {
    // Rejeu concurrent : la clé unique est déjà prise, on corrige à la place.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    )
      return backfillFixedCost(input);
    throw err;
  }
}
