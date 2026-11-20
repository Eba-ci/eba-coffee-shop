// lib/salaries/settle-mutations.ts
//
// Règlement d'arriéré PAR LOT (ADMIN seul) : un versement SALAIRE par mois
// sélectionné, tous dans UNE transaction. Les versements d'un même jour et d'un
// même mode alimentent la MÊME ligne globale de masse salariale, recalculée une
// seule fois (`syncSalaryExpenses`).
//
// Coût (pas de N+1) : un verrou d'employé, une lecture des clés d'idempotence,
// une lecture de l'employé avec ses taux/versements/ajustements (le journal est
// rejoué en mémoire), un `createMany`, puis la synchronisation (une requête de
// sommes pour toutes les clés).

import { requireSalaryAdmin } from './admin-guard';
import prisma from '@/lib/prisma';
import { salarySettleSchema } from '@/lib/schemas/salary';
import {
  formatLocalDateOnly,
  parseDateOnlyToUTC,
  todayDateString,
} from '@/lib/timezone';
import { monthLabel } from '@/lib/fixed-costs/month';
import { keyOf, syncSalaryExpenses, withRetry } from './expense-sync';
import { SalaryIdempotencyConflictError } from './errors';
import { salaryLedgerThrough } from './ledger';
import {
  SALARY_RATE_SELECT,
  toEmployeeLike,
  toSalaryRateLike,
  ACTIVE_PAYMENT_WHERE,
} from './mappers';
import { compareStrings } from './month';

const itemKey = (batchKey: string, month: string) => `${batchKey}:${month}`;

export async function settleSalaryMonths(
  input: unknown,
  today: string = todayDateString()
) {
  const session = await requireSalaryAdmin();
  const d = salarySettleSchema.parse(input);
  const asOf = [today.slice(0, 7), ...d.items.map((i) => i.month)].sort(
    compareStrings
  )[d.items.length];

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      // Deux règlements simultanés du même employé s'attendent : le second
      // relit un reste à payer déjà diminué.
      await tx.$queryRaw`SELECT "id" FROM "employee" WHERE "id" = ${d.employeeId} FOR UPDATE`;

      // Rejeu (double clic) : tout le lot existe déjà → on le renvoie.
      const keys = d.items.map((i) => itemKey(d.idempotencyKey, i.month));
      const done = await tx.salaryPayment.findMany({
        where: { idempotencyKey: { in: keys } },
      });
      if (done.length > 0) {
        const same =
          done.length === d.items.length &&
          done.every((p) => {
            const item = d.items.find(
              (i) => itemKey(d.idempotencyKey, i.month) === p.idempotencyKey
            );
            return (
              item &&
              p.employeeId === d.employeeId &&
              p.amount === item.amount &&
              p.month === item.month &&
              formatLocalDateOnly(p.date) === item.date
            );
          });
        if (!same) {
          throw new SalaryIdempotencyConflictError(
            'Ce lot a déjà été enregistré avec un contenu différent.'
          );
        }
        return { created: 0, replayed: true as const };
      }

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
            select: {
              month: true,
              nature: true,
              amount: true,
              canceledAt: true,
            },
          },
        },
      });
      const ledger = salaryLedgerThrough({
        employee: toEmployeeLike(employee),
        rates: employee.rates.map(toSalaryRateLike),
        payments: employee.payments,
        adjustments: employee.adjustments,
        month: asOf,
      });
      const remainingByMonth = new Map(
        ledger.map((m) => [m.month, m.remainingToPay])
      );
      for (const item of d.items) {
        const remaining = remainingByMonth.get(item.month) ?? 0;
        if (item.amount > remaining) {
          throw new Error(
            `${monthLabel(item.month)} : le montant dépasse le reste à payer (${remaining.toLocaleString('fr-FR')} F).`
          );
        }
      }

      await tx.salaryPayment.createMany({
        data: d.items.map((i) => ({
          employeeId: d.employeeId,
          date: parseDateOnlyToUTC(i.date)!,
          month: i.month,
          amount: i.amount,
          type: 'SALAIRE' as const,
          paymentMethod: d.paymentMethod,
          recoveryMonths: 1,
          note: d.note ?? null,
          idempotencyKey: itemKey(d.idempotencyKey, i.month),
          createdById: session.user.id,
        })),
      });
      await syncSalaryExpenses(
        tx,
        d.items.map((i) =>
          keyOf({
            date: parseDateOnlyToUTC(i.date)!,
            paymentMethod: d.paymentMethod,
          })
        ),
        session.user.id
      );
      return { created: d.items.length, replayed: false as const };
    })
  );
}
