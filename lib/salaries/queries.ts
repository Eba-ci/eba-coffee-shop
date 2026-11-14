// lib/salaries/queries.ts
//
// Lectures du module salaires. La logique de calcul vit dans `compute.ts`
// (pure) ; ici on ne fait que charger les données et l'appliquer.
//
// `getMonthlySalaryTotal` est LE point d'entrée des rôles non-admin : il
// renvoie un nombre seul, sans jamais exposer d'employé.

import prisma from '@/lib/prisma';
import { parseDateOnlyToUTC } from '@/lib/timezone';
import { salaryDueForMonth } from './compute';
import { toEmployeeLike, toSalaryRateLike } from './mappers';
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
      // Seuls les ajustements ACTIFS du mois entrent dans le dû : une prime
      // augmente le total, une retenue le diminue ; un ajustement annulé sort.
      adjustments: {
        where: { month, canceledAt: null },
        select: { month: true, nature: true, amount: true, canceledAt: true },
      },
    },
  });

  let total = 0;
  for (const e of employees) {
    const employee = toEmployeeLike(e);
    const rates = e.rates.map(toSalaryRateLike);
    total += salaryDueForMonth(employee, rates, month, e.adjustments).due;
  }
  return total;
}
