// lib/salaries/rate-mutations.ts
//
// Taux datés depuis la fiche employé (#441) : ajout, modification, suppression.
// Un taux couvre des MOIS ENTIERS et deux taux ne se chevauchent jamais
// (`planRatePeriods`) ; un changement qui modifierait le dû d'un mois DÉJÀ
// versé est refusé (`paidMonthImpacts`), sans forçage : on annule d'abord les
// versements erronés. Tout se fait dans une transaction, l'employé verrouillé
// (deux modifications simultanées s'attendent).

import { SALARY_RATE_DUPLICATE_MESSAGE } from '@/config/constants';
import { Prisma } from '@/generated/prisma/client';
import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import {
  salaryRateAddSchema,
  salaryRateDeleteSchema,
  salaryRateUpdateSchema,
} from '@/lib/schemas/salary';
import { formatLocalDateOnly, parseDateOnlyToUTC } from '@/lib/timezone';
import { toEmployeeLike } from './mappers';
import {
  draftBounds,
  paidImpactMessage,
  paidMonthImpacts,
  planRatePeriods,
  type RateDraft,
  type RatePeriod,
} from './rate-periods';

const toPeriod = (r: {
  id: string;
  monthlyAmount: number;
  startDate: Date;
  endDate: Date | null;
}): RatePeriod => ({
  id: r.id,
  monthlyAmount: r.monthlyAmount,
  startDate: formatLocalDateOnly(r.startDate),
  endDate: r.endDate ? formatLocalDateOnly(r.endDate) : null,
});

async function loadEmployee(tx: Prisma.TransactionClient, employeeId: string) {
  await tx.$queryRaw`SELECT "id" FROM "employee" WHERE "id" = ${employeeId} FOR UPDATE`;
  const employee = await tx.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: {
      startDate: true,
      endDate: true,
      rates: {
        select: {
          id: true,
          monthlyAmount: true,
          startDate: true,
          endDate: true,
        },
      },
      // Mois déjà versés (salaire, acompte ou avance) : une seule lecture.
      payments: { select: { month: true }, distinct: ['month'] },
    },
  });
  return {
    like: toEmployeeLike(employee),
    startDate: formatLocalDateOnly(employee.startDate),
    rates: employee.rates.map(toPeriod),
    paidMonths: employee.payments.map((p) => p.month),
  };
}

/** Planifie, contrôle les mois versés, puis écrit (fermetures + taux). */
async function applyRate(
  tx: Prisma.TransactionClient,
  employeeId: string,
  draft: RateDraft
) {
  const ctx = await loadEmployee(tx, employeeId);
  const plan = planRatePeriods(ctx.rates, draft, ctx.startDate);
  if (!plan.ok) throw new Error(plan.error);
  const impacts = paidMonthImpacts(
    ctx.like,
    ctx.rates,
    plan.rates,
    ctx.paidMonths
  );
  if (impacts.length > 0) throw new Error(paidImpactMessage(impacts));

  for (const c of plan.closed) {
    await tx.salaryRate.update({
      where: { id: c.id },
      data: { endDate: parseDateOnlyToUTC(c.endDate)! },
    });
  }
  const { startDate, endDate } = draftBounds(draft);
  const data = {
    monthlyAmount: draft.monthlyAmount,
    startDate: parseDateOnlyToUTC(startDate)!,
    endDate: endDate ? parseDateOnlyToUTC(endDate)! : null,
  };
  return draft.id
    ? tx.salaryRate.update({ where: { id: draft.id }, data })
    : tx.salaryRate.create({ data: { employeeId, ...data } });
}

const duplicate = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export async function addSalaryRate(input: unknown) {
  await requireAdmin();
  const d = salaryRateAddSchema.parse(input);
  try {
    return await prisma.$transaction((tx) =>
      applyRate(tx, d.employeeId, {
        monthlyAmount: d.monthlyAmount,
        startMonth: d.startMonth,
        endMonth: d.endMonth,
      })
    );
  } catch (err) {
    if (duplicate(err)) throw new Error(SALARY_RATE_DUPLICATE_MESSAGE);
    throw err;
  }
}

export async function updateSalaryRate(input: unknown) {
  await requireAdmin();
  const d = salaryRateUpdateSchema.parse(input);
  const rate = await prisma.salaryRate.findUniqueOrThrow({
    where: { id: d.rateId },
    select: { employeeId: true },
  });
  try {
    return await prisma.$transaction((tx) =>
      applyRate(tx, rate.employeeId, {
        id: d.rateId,
        monthlyAmount: d.monthlyAmount,
        startMonth: d.startMonth,
        endMonth: d.endMonth,
      })
    );
  } catch (err) {
    if (duplicate(err)) throw new Error(SALARY_RATE_DUPLICATE_MESSAGE);
    throw err;
  }
}

/** Supprime un taux, sauf s'il porte le dû d'un mois déjà versé. */
export async function deleteSalaryRate(input: unknown) {
  await requireAdmin();
  const d = salaryRateDeleteSchema.parse(input);
  const rate = await prisma.salaryRate.findUnique({
    where: { id: d.rateId },
    select: { employeeId: true },
  });
  if (!rate) return { id: d.rateId, deleted: true }; // idempotent
  return prisma.$transaction(async (tx) => {
    const ctx = await loadEmployee(tx, rate.employeeId);
    const after = ctx.rates.filter((r) => r.id !== d.rateId);
    const impacts = paidMonthImpacts(
      ctx.like,
      ctx.rates,
      after,
      ctx.paidMonths
    );
    if (impacts.length > 0) throw new Error(paidImpactMessage(impacts));
    await tx.salaryRate.delete({ where: { id: d.rateId } });
    return { id: d.rateId, deleted: true };
  });
}
