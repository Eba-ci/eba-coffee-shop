// lib/salaries/payroll-mutations.ts
//
// Paie de TOUTE la masse salariale d'un mois en un geste (ADMIN seul) : un
// versement SALAIRE par employé coché, même date et même mode, dans UNE
// transaction. Ils alimentent la même ligne globale de dépense, recalculée une
// seule fois (`syncSalaryExpenses`).
//
// Coût (pas de N+1) : un verrou de toutes les lignes employé (ordre des ids),
// une lecture des clés d'idempotence, une lecture de tous les employés avec
// taux/versements/ajustements (journal rejoué en mémoire), un `createMany`.

import { requireAdmin } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { salaryPayrollSchema } from '@/lib/schemas/salary';
import {
  formatLocalDateOnly,
  parseDateOnlyToUTC,
  todayDateString,
} from '@/lib/timezone';
import { keyOf, syncSalaryExpenses, withRetry } from './expense-sync';
import { SalaryIdempotencyConflictError } from './errors';
import { salaryLedgerThrough } from './ledger';
import {
  SALARY_RATE_SELECT,
  toEmployeeLike,
  toSalaryRateLike,
} from './mappers';
import { compareStrings } from './month';

const itemKey = (batchKey: string, employeeId: string) =>
  `${batchKey}:${employeeId}`;

export async function settlePayroll(
  input: unknown,
  today: string = todayDateString()
) {
  const session = await requireAdmin();
  const d = salaryPayrollSchema.parse(input);
  const asOf = [today.slice(0, 7), d.month].sort(compareStrings)[1];
  const ids = d.items.map((i) => i.employeeId).sort(compareStrings);
  const date = parseDateOnlyToUTC(d.date)!;

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "employee" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;

      const keys = d.items.map((i) => itemKey(d.idempotencyKey, i.employeeId));
      const done = await tx.salaryPayment.findMany({
        where: { idempotencyKey: { in: keys } },
      });
      if (done.length > 0) {
        const same =
          done.length === d.items.length &&
          done.every((p) => {
            const item = d.items.find(
              (i) =>
                itemKey(d.idempotencyKey, i.employeeId) === p.idempotencyKey
            );
            return (
              item &&
              p.employeeId === item.employeeId &&
              p.amount === item.amount &&
              p.month === d.month &&
              formatLocalDateOnly(p.date) === d.date
            );
          });
        if (!same) {
          throw new SalaryIdempotencyConflictError(
            'Ce lot a déjà été enregistré avec un contenu différent.'
          );
        }
        return { created: 0, replayed: true as const };
      }

      const employees = await tx.employee.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          rates: { select: SALARY_RATE_SELECT },
          payments: {
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
      const byId = new Map(employees.map((e) => [e.id, e]));
      for (const item of d.items) {
        const e = byId.get(item.employeeId);
        if (!e) throw new Error('Employé introuvable.');
        const ledger = salaryLedgerThrough({
          employee: toEmployeeLike(e),
          rates: e.rates.map(toSalaryRateLike),
          payments: e.payments,
          adjustments: e.adjustments,
          month: asOf,
        });
        const remaining =
          ledger.find((m) => m.month === d.month)?.remainingToPay ?? 0;
        if (item.amount > remaining) {
          throw new Error(
            `${e.name} : le montant dépasse le reste à payer (${remaining.toLocaleString('fr-FR')} F).`
          );
        }
      }

      await tx.salaryPayment.createMany({
        data: d.items.map((i) => ({
          employeeId: i.employeeId,
          date,
          month: d.month,
          amount: i.amount,
          type: 'SALAIRE' as const,
          paymentMethod: d.paymentMethod,
          recoveryMonths: 1,
          note: d.note ?? null,
          idempotencyKey: itemKey(d.idempotencyKey, i.employeeId),
          createdById: session.user.id,
        })),
      });
      await syncSalaryExpenses(
        tx,
        [keyOf({ date, paymentMethod: d.paymentMethod })],
        session.user.id
      );
      return { created: d.items.length, replayed: false as const };
    })
  );
}
