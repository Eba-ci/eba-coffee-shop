// lib/salaries/arrears.ts
//
// Impayés et arriéré (#444). Un mois est CLÔTURÉ dès qu'il est strictement
// antérieur au mois de référence : le mois courant n'est jamais un impayé.
// L'arriéré est une dette de TRÉSORERIE : il ne modifie jamais le dû du mois ni
// le total global des salaires (point mort), qui restent la somme des taux et
// des primes. Aucune règle dupliquée côté composant : cette fonction est LA
// source, testable sans base.

import { compareStrings } from './month';
import type { SalaryArrears, SalaryMonthSummary } from './types';

/**
 * Arriéré d'un employé à `asOfMonth` : somme des restes à payer des mois
 * strictement antérieurs, du plus ancien au plus récent. `remainingToPay` du
 * journal tient déjà compte des acomptes, des avances récupérées et exclut les
 * versements annulés : rien n'est recalculé ici.
 */
export function salaryArrears(
  months: SalaryMonthSummary[],
  asOfMonth: string
): SalaryArrears {
  const closed = months
    .filter((m) => m.month < asOfMonth && m.remainingToPay > 0)
    .sort((a, b) => compareStrings(a.month, b.month))
    .map((m) => ({ month: m.month, remaining: m.remainingToPay }));
  return {
    total: closed.reduce((a, m) => a + m.remaining, 0),
    oldestMonth: closed[0]?.month ?? null,
    months: closed,
  };
}

/**
 * Répartition du montant à proposer au paiement : d'abord le reste du mois
 * courant, puis les mois les plus anciens (dans l'ordre chronologique). Le
 * total vaut exactement `reste courant + arriéré`.
 */
export function salaryPaymentProposal(
  current: SalaryMonthSummary,
  arrears: SalaryArrears
): { total: number; allocations: { month: string; amount: number }[] } {
  const allocations = [
    { month: current.month, amount: current.remainingToPay },
    ...arrears.months.map((m) => ({ month: m.month, amount: m.remaining })),
  ].filter((a) => a.amount > 0);
  return {
    total: allocations.reduce((a, x) => a + x.amount, 0),
    allocations,
  };
}
