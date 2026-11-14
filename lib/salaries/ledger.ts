// lib/salaries/ledger.ts
//
// Journal mensuel des salaires et récupération des avances :
// - une AVANCE est un prêt : son solde est récupéré automatiquement sur les
//   paies SUIVANTES (`recoveryMonths` étale la récupération), et le reliquat
//   qu'un mois n'a pas pu absorber est reporté au mois d'après ;
// - un ACOMPTE est une avance sur le salaire DU MOIS : il se déduit du dû du
//   mois auquel il est rattaché ;
// - `reste à payer = dû − salaires − acomptes − avances récupérées` (borné à 0),
//   et `overpaid` expose l'excédent quand les versements dépassent le dû.

import type { SalaryPaymentType } from '@/generated/prisma/enums';
import { compareStrings, monthOf, monthRange, nextMonth } from './month';
import { splitAmount } from './money';
import { salaryDueForMonth } from './due';
import type {
  AdvanceLike,
  AdvanceRecovery,
  EmployeeLike,
  SalaryAdjustmentLike,
  SalaryMonthSummary,
  SalaryPaymentLike,
  SalaryRateLike,
} from './types';

/** Étalement d'une avance : à partir du mois SUIVANT le versement. */
export function advanceRecoverySchedule(
  advance: AdvanceLike
): AdvanceRecovery[] {
  const months = Math.max(1, Math.floor(advance.recoveryMonths ?? 1));
  const parts = splitAmount(advance.amount, new Array(months).fill(1));
  const out: AdvanceRecovery[] = [];
  let m = advance.month;
  for (let i = 0; i < months; i++) {
    m = nextMonth(m);
    out.push({ month: m, amount: parts[i] });
  }
  return out;
}

type AdvanceState = {
  month: string;
  amount: number;
  parts: number[];
  remaining: number;
};

function sumOf(payments: SalaryPaymentLike[], type: SalaryPaymentType): number {
  return payments
    .filter((p) => p.type === type)
    .reduce((a, p) => a + p.amount, 0);
}

/**
 * Cible de récupération d'une avance pour un mois donné : la part prévue tant
 * qu'on est dans la fenêtre d'étalement, puis le reliquat (pour ne rien laisser
 * traîner une fois le plan épuisé).
 */
function recoveryTarget(state: AdvanceState, month: string): number {
  const months = monthRange(state.month, month);
  const index = months.length - 2; // le mois suivant le versement = index 0
  if (index < 0) return 0; // l'avance n'est pas encore récupérable ce mois
  if (index < state.parts.length)
    return Math.min(state.parts[index], state.remaining);
  return state.remaining;
}

/**
 * Journal mensuel des salaires d'un employé, du plus ancien au plus récent.
 * `months` doit être croissant ; le solde d'avance est reporté de mois en mois.
 */
export function salaryLedger(input: {
  employee: EmployeeLike;
  rates: SalaryRateLike[];
  payments: SalaryPaymentLike[];
  adjustments?: SalaryAdjustmentLike[];
  months: string[];
}): SalaryMonthSummary[] {
  const { employee, rates, adjustments = [] } = input;
  const { payments } = input;
  const advances: AdvanceState[] = payments
    .filter((p) => p.type === 'AVANCE')
    .map((p) => ({
      month: p.month,
      amount: p.amount,
      parts: advanceRecoverySchedule(p).map((r) => r.amount),
      remaining: p.amount,
    }));
  advances.sort((a, b) => compareStrings(a.month, b.month));

  const out: SalaryMonthSummary[] = [];
  for (const month of input.months) {
    const { due, baseDue, primes, retenues } = salaryDueForMonth(
      employee,
      rates,
      month,
      adjustments
    );
    const ofMonth = payments.filter((p) => p.month === month);
    const salariesPaid = sumOf(ofMonth, 'SALAIRE');
    const advancesPaid = sumOf(ofMonth, 'ACOMPTE');
    const advanceGiven = sumOf(ofMonth, 'AVANCE');

    // Avances récupérables ce mois : versées AVANT ce mois (jamais le même mois).
    const active = advances.filter((s) => s.month < month && s.remaining > 0);
    const available = Math.max(0, due - salariesPaid - advancesPaid);
    let recovered = 0;
    for (const s of active) {
      if (recovered >= available) break;
      const take = Math.min(
        recoveryTarget(s, month),
        s.remaining,
        available - recovered
      );
      s.remaining -= take;
      recovered += take;
    }

    const advanceBalance = advances
      .filter((s) => s.month <= month)
      .reduce((a, s) => a + s.remaining, 0);
    const covered = salariesPaid + advancesPaid + recovered;

    out.push({
      month,
      due,
      baseDue,
      primes,
      retenues,
      salariesPaid,
      advancesPaid,
      advanceGiven,
      advanceRecovered: recovered,
      remainingToPay: Math.max(0, due - covered),
      overpaid: Math.max(0, covered - due),
      advanceBalance,
    });
  }
  return out;
}

/**
 * Journal depuis les débuts de l'employé JUSQU'À `month` inclus (le solde
 * d'avance dépend des mois antérieurs). Une seule source pour la vue du mois et
 * l'analyse de l'arriéré : aucun composant ne rejoue la règle.
 */
export function salaryLedgerThrough(input: {
  employee: EmployeeLike;
  rates: SalaryRateLike[];
  payments: SalaryPaymentLike[];
  adjustments?: SalaryAdjustmentLike[];
  month: string;
}): SalaryMonthSummary[] {
  const firstPayment = input.payments
    .map((p) => p.month)
    .sort(compareStrings)[0];
  const firstRate = input.rates
    .map((r) => monthOf(r.startDate))
    .sort(compareStrings)[0];
  const firstAdjustment = (input.adjustments ?? [])
    .map((a) => a.month)
    .sort(compareStrings)[0];
  // Le mois d'entrée est un candidat : un mois sans taux ni versement reste
  // un mois d'emploi (dû 0), utile au détail de l'arriéré.
  const firstEmployee = monthOf(input.employee.startDate);
  const first = [
    input.month,
    firstPayment,
    firstRate,
    firstAdjustment,
    firstEmployee,
  ]
    .filter((m): m is string => Boolean(m))
    .sort(compareStrings)[0];
  return salaryLedger({
    ...input,
    months: monthRange(first, input.month),
  });
}

/**
 * Résumé d'un mois isolé, en rejouant le journal depuis les débuts de
 * l'employé (le solde d'avance dépend des mois antérieurs).
 */
export function summarizeSalaryMonth(input: {
  employee: EmployeeLike;
  rates: SalaryRateLike[];
  payments: SalaryPaymentLike[];
  adjustments?: SalaryAdjustmentLike[];
  month: string;
}): SalaryMonthSummary {
  const ledger = salaryLedgerThrough(input);
  return ledger[ledger.length - 1];
}
