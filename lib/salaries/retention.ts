// lib/salaries/retention.ts
//
// Conservation et anonymisation de l'historique des salaires. La durée est
// fixée par `RETENTION.salaryYearsAfterContract` (config/data-protection.ts :
// 10 ans APRÈS LA FIN DU CONTRAT, à faire valider par un avis juridique).
//
// Passé ce délai, le nom, le poste et la note d'un employé SORTI sont
// anonymisés ; les montants (taux et versements) restent — ils servent à la
// paie agrégée et à la comptabilité. Un employé encore en poste (pas de date de
// sortie) n'est JAMAIS touché. Aucune donnée n'est purgée avant la durée.

import { RETENTION } from '@/config/data-protection';
import prisma from '@/lib/prisma';
import { parseDateOnlyToUTC } from '@/lib/timezone';

/** Préfixe des noms anonymisés : rejoue sans effet (idempotence). */
export const ANONYMIZED_EMPLOYEE_PREFIX = 'Anonyme ';

export function anonymizedEmployeeName(id: string): string {
  return `${ANONYMIZED_EMPLOYEE_PREFIX}${id}`;
}

/**
 * Vrai si l'historique d'un employé sorti (`endDate`) a dépassé la durée de
 * conservation à la date `now`. `endDate` null (en poste) → jamais expiré.
 * Pure (testable) : ne lit pas la base.
 */
export function isSalaryRetentionExpired(
  endDate: string | null,
  now: Date,
  years: number = RETENTION.salaryYearsAfterContract
): boolean {
  if (!endDate) return false;
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const end = parseDateOnlyToUTC(endDate);
  return end !== undefined && end.getTime() < cutoff.getTime();
}

/**
 * Anonymise nom / poste / note des employés sortis depuis plus de la durée de
 * conservation, et vide la note de leurs versements. Ne touche ni les dates, ni
 * les montants, ni les employés encore en poste. Idempotente.
 * `now` et `years` injectables pour les tests.
 */
export async function anonymizeExpiredSalaryData(
  now = new Date(),
  years: number = RETENTION.salaryYearsAfterContract
): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - years);

  const employees = await prisma.employee.findMany({
    where: {
      endDate: { not: null, lt: cutoff },
      name: { not: { startsWith: ANONYMIZED_EMPLOYEE_PREFIX } },
    },
    select: { id: true },
  });

  let done = 0;
  for (const { id } of employees) {
    await prisma.$transaction([
      prisma.salaryPayment.updateMany({
        where: { employeeId: id },
        data: { note: null },
      }),
      prisma.employee.update({
        where: { id },
        data: {
          name: anonymizedEmployeeName(id),
          position: null,
          note: null,
          active: false,
        },
      }),
    ]);
    done += 1;
  }
  return done;
}
