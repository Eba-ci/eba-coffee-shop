// lib/salaries/adjustment-mutations.ts
//
// Écritures des PRIMES et RETENUES (#443), réservées à l'ADMIN. Le contrôle
// « une retenue ne rend pas le dû négatif » passe par `salaryDueForMonth` — la
// même règle que tous les calculs, jamais une seconde implémentation — dans la
// MÊME transaction que l'écriture. Un ajustement n'est jamais supprimé :
// `cancelAdjustment` pose `canceledAt` et conserve la ligne.

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import {
  salaryAdjustmentCancelSchema,
  salaryAdjustmentCreateSchema,
} from '@/lib/schemas/salary';
import { parseDateOnlyToUTC } from '@/lib/timezone';
import { salaryDueForMonth } from './due';
import { toEmployeeLike, toSalaryRateLike } from './mappers';

/**
 * Crée une prime ou une retenue. Refusée si les retenues cumulées du mois
 * dépassent le prorata des taux (`SALARY_RETENUE_EXCEEDS_DUE_MESSAGE`).
 */
export async function createSalaryAdjustment(input: unknown) {
  const session = await requireAdmin();
  const d = salaryAdjustmentCreateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findUniqueOrThrow({
      where: { id: d.employeeId },
      select: {
        startDate: true,
        endDate: true,
        rates: { select: { monthlyAmount: true, startDate: true } },
        adjustments: {
          where: { month: d.month, canceledAt: null },
          select: { month: true, nature: true, amount: true, canceledAt: true },
        },
      },
    });
    // Lève le message clair si la nouvelle retenue dépasse le dû des taux.
    salaryDueForMonth(
      toEmployeeLike(employee),
      employee.rates.map(toSalaryRateLike),
      d.month,
      [
        ...employee.adjustments,
        { month: d.month, nature: d.nature, amount: d.amount },
      ]
    );
    return tx.salaryAdjustment.create({
      data: {
        employeeId: d.employeeId,
        month: d.month,
        date: parseDateOnlyToUTC(d.date)!,
        nature: d.nature,
        amount: d.amount,
        note: d.note ?? null,
        createdById: session.user.id,
      },
    });
  });
}

/**
 * Annule un ajustement en le MARQUANT (jamais de suppression). Idempotent :
 * rejouer l'annulation laisse la date d'annulation d'origine.
 */
export async function cancelSalaryAdjustment(input: unknown) {
  await requireAdmin();
  const d = salaryAdjustmentCancelSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const current = await tx.salaryAdjustment.findUniqueOrThrow({
      where: { id: d.adjustmentId },
    });
    if (current.canceledAt) return current;
    return tx.salaryAdjustment.update({
      where: { id: current.id },
      data: { canceledAt: new Date() },
    });
  });
}
