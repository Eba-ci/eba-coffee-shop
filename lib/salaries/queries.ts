// lib/salaries/queries.ts
//
// Lectures du module salaires. La logique de calcul vit dans `compute.ts`
// (pure) ; ici on ne fait que charger les données et l'appliquer.
//
// `getMonthlySalaryTotal` est LE point d'entrée des rôles non-admin : il
// renvoie un nombre seul, sans jamais exposer d'employé.

import prisma from '@/lib/prisma';
import { formatLocalDateOnly, parseDateOnlyToUTC } from '@/lib/timezone';
import {
  salaryDueForMonth,
  type EmployeeLike,
  type SalaryRateLike,
} from './compute';
import { monthBounds } from './month';

/**
 * Total des salaires DÛS pour un mois civil (« YYYY-MM »), tous employés
 * confondus. Un simple nombre : aucune donnée nominative ne franchit cette
 * frontière (les autres rôles ne voient que l'agrégat).
 */
export async function getMonthlySalaryTotal(month: string): Promise<number> {
  const { start, end } = monthBounds(month);
  const employees = await prisma.employee.findMany({
    where: {
      startDate: { lte: parseDateOnlyToUTC(end)! },
      OR: [{ endDate: null }, { endDate: { gte: parseDateOnlyToUTC(start)! } }],
    },
    select: {
      startDate: true,
      endDate: true,
      rates: { select: { monthlyAmount: true, startDate: true } },
    },
  });

  let total = 0;
  for (const e of employees) {
    const employee: EmployeeLike = {
      startDate: formatLocalDateOnly(e.startDate),
      endDate: e.endDate ? formatLocalDateOnly(e.endDate) : null,
    };
    const rates: SalaryRateLike[] = e.rates.map((r) => ({
      monthlyAmount: r.monthlyAmount,
      startDate: formatLocalDateOnly(r.startDate),
    }));
    total += salaryDueForMonth(employee, rates, month).due;
  }
  return total;
}
