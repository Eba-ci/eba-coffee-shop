// lib/salaries/bonus-mutations.ts
//
// Trop-perçu d'un mois → prime (« bonus »). Un mois payé au-delà de son dû
// n'est jamais reporté sur le suivant (règle du journal) : l'admin choisit de
// le qualifier en prime, ce qui monte le dû du mois du même montant. Le
// versement n'est pas touché, donc la dépense globale non plus.
// Idempotent : une fois le dû relevé, le trop-perçu vaut 0 et l'appel est un
// no-op.

import { requireSalaryAdmin } from './admin-guard';
import prisma from '@/lib/prisma';
import { salaryBonusFromOverpaymentSchema } from '@/lib/schemas/salary';
import { todayDateString } from '@/lib/timezone';
import {
  SALARY_RATE_SELECT,
  toEmployeeLike,
  toSalaryRateLike,
  ACTIVE_PAYMENT_WHERE,
} from './mappers';
import { salaryLedgerThrough } from './ledger';
import { parseDateOnlyToUTC } from '@/lib/timezone';

export const SALARY_BONUS_NOTE = 'Trop-perçu converti en bonus';

export async function convertOverpaymentToBonus(
  input: unknown,
  today: string = todayDateString()
) {
  const session = await requireSalaryAdmin();
  const d = salaryBonusFromOverpaymentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "employee" WHERE "id" = ${d.employeeId} FOR UPDATE`;
    const employee = await tx.employee.findUniqueOrThrow({
      where: { id: d.employeeId },
      select: {
        startDate: true,
        endDate: true,
        rates: { select: SALARY_RATE_SELECT },
        payments: {
          where: ACTIVE_PAYMENT_WHERE,
          select: {
            month: true,
            type: true,
            amount: true,
            recoveryMonths: true,
          },
        },
        adjustments: {
          select: { month: true, nature: true, amount: true, canceledAt: true },
        },
      },
    });
    const ledger = salaryLedgerThrough({
      employee: toEmployeeLike(employee),
      rates: employee.rates.map(toSalaryRateLike),
      payments: employee.payments,
      adjustments: employee.adjustments,
      month: d.month,
    });
    const overpaid = ledger[ledger.length - 1]?.overpaid ?? 0;
    if (overpaid <= 0) return { created: false as const, amount: 0 };
    await tx.salaryAdjustment.create({
      data: {
        employeeId: d.employeeId,
        month: d.month,
        date: parseDateOnlyToUTC(today)!,
        nature: 'PRIME',
        amount: overpaid,
        note: SALARY_BONUS_NOTE,
        createdById: session.user.id,
      },
    });
    return { created: true as const, amount: overpaid };
  });
}
