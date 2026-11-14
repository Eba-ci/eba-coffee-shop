// lib/salaries/due.ts
//
// Salaire dû d'un mois, proratisé au JOUR CALENDAIRE :
// - chaque taux mensuel ne couvre que les jours où il est en vigueur ;
// - un changement de taux, une entrée ou une sortie en cours de mois
//   n'impliquent que les jours concernés ;
// - le montant d'un segment de taux est `montant × jours_sous_ce_taux /
//   jours_du_mois`, arrondi au FCFA entier par plus fort reste ENTRE SEGMENTS
//   (`roundToWholeFcfa`) : la somme des segments retombe sur l'arrondi du
//   total exact, sans dérive.

import { SALARY_RETENUE_EXCEEDS_DUE_MESSAGE } from '@/config/constants';
import { compareStrings, eachDayOfMonth, monthBounds } from './month';
import { roundToWholeFcfa } from './money';
import type {
  EmployeeLike,
  SalaryAdjustmentLike,
  SalaryDue,
  SalaryRateLike,
  SalarySegment,
} from './types';

/** Fenêtre d'emploi retenue dans le mois (jours civils, bornes incluses). */
export function employmentWindow(
  employee: EmployeeLike,
  month: string
): { from: string; to: string; employed: boolean } {
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const from =
    employee.startDate > monthStart ? employee.startDate : monthStart;
  const to =
    employee.endDate && employee.endDate < monthEnd
      ? employee.endDate
      : monthEnd;
  return { from, to, employed: from <= to };
}

/**
 * Salaire dû pour `month` (FCFA entiers), proratisé au jour calendaire. Le taux
 * en vigueur un jour donné est le dernier taux commencé à cette date ; les
 * jours hors fenêtre d'emploi ne comptent pas, et les jours d'emploi sans aucun
 * taux défini sont comptés dans `daysWithoutRate` (le dû reste 0 pour eux, mais
 * l'appelant peut le signaler au lieu de renvoyer un 0 silencieux).
 *
 * `adjustments` (facultatif) ajoute les primes et retenues du mois : le dû NET
 * vaut `prorata + primes − retenues`. Une retenue cumulée supérieure au prorata
 * des taux est REFUSÉE (message clair) : jamais de dû négatif silencieux. Les
 * ajustements annulés (`canceledAt`) sont ignorés.
 */
export function salaryDueForMonth(
  employee: EmployeeLike,
  rates: SalaryRateLike[],
  month: string,
  adjustments: SalaryAdjustmentLike[] = []
): SalaryDue {
  const days = eachDayOfMonth(month);
  const n = days.length;
  const { from, to, employed } = employmentWindow(employee, month);
  const sorted = [...rates].sort((a, b) =>
    compareStrings(a.startDate, b.startDate)
  );

  // Nombre de jours d'emploi par taux, et jours d'emploi sans aucun taux.
  const countByRate = new Map<number, number>();
  let daysEmployed = 0;
  let daysWithoutRate = 0;
  if (employed) {
    for (const day of days) {
      if (day < from || day > to) continue;
      daysEmployed += 1;
      let idx = -1;
      for (let r = 0; r < sorted.length; r++) {
        if (sorted[r].startDate <= day) idx = r;
        else break;
      }
      if (idx < 0) {
        daysWithoutRate += 1;
        continue;
      }
      countByRate.set(idx, (countByRate.get(idx) ?? 0) + 1);
    }
  }

  const indices = [...countByRate.keys()].sort((a, b) => a - b);
  const exacts = indices.map(
    (i) => (sorted[i].monthlyAmount * countByRate.get(i)!) / n
  );
  const amounts = roundToWholeFcfa(exacts);

  const segments: SalarySegment[] = indices.map((i, k) => ({
    rateStartDate: sorted[i].startDate,
    monthlyAmount: sorted[i].monthlyAmount,
    days: countByRate.get(i)!,
    amount: amounts[k],
  }));

  const baseDue = amounts.reduce((a, b) => a + b, 0);
  const active = adjustments.filter((a) => a.month === month && !a.canceledAt);
  const primes = active
    .filter((a) => a.nature === 'PRIME')
    .reduce((a, b) => a + b.amount, 0);
  const retenues = active
    .filter((a) => a.nature === 'RETENUE')
    .reduce((a, b) => a + b.amount, 0);
  if (retenues > baseDue) throw new Error(SALARY_RETENUE_EXCEEDS_DUE_MESSAGE);

  return {
    month,
    due: baseDue + primes - retenues,
    baseDue,
    primes,
    retenues,
    daysEmployed,
    daysWithoutRate,
    segments,
  };
}
