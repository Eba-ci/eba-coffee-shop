// lib/salaries/compute.ts
//
// Règles PURES de calcul des salaires — rien ici ne touche la base : employé,
// taux et versements sont passés en paramètre (testable, isomorphe).
//
// Principes :
// - le salaire dû d'un mois est proratisé au JOUR CALENDAIRE : chaque montant
//   mensuel se répartit sur les jours du mois, et un changement de taux, une
//   entrée ou une sortie en cours de mois ne retiennent que les jours concernés.
//   L'arrondi au FCFA entier se fait par plus fort reste (`splitAmount`), de
//   sorte que la somme des parts retombe sur le total ;
// - un ACOMPTE est une avance sur le salaire DU MOIS : il se déduit du dû du
//   mois auquel il est rattaché ;
// - une AVANCE est un prêt : son solde est récupéré automatiquement sur les
//   paies SUIVANTES (`recoveryMonths` étale la récupération), et le reliquat
//   qu'un mois n'a pas pu absorber est reporté au mois d'après.

import type { SalaryPaymentType } from '@/generated/prisma/enums';
import {
  eachDayOfMonth,
  monthBounds,
  monthOf,
  monthRange,
  nextMonth,
} from './month';
import { splitAmount } from './money';

export type SalaryRateLike = {
  monthlyAmount: number; // FCFA/mois
  startDate: string; // prise d'effet, incluse (YYYY-MM-DD)
};

export type EmployeeLike = {
  startDate: string; // date d'entrée (YYYY-MM-DD)
  endDate: string | null; // date de sortie, incluse (null = en poste)
};

export type SalaryPaymentLike = {
  month: string; // mois concerné "YYYY-MM"
  type: SalaryPaymentType;
  amount: number; // FCFA
  recoveryMonths?: number; // AVANCE : étalement (défaut 1)
};

export type SalarySegment = {
  rateStartDate: string;
  monthlyAmount: number;
  days: number;
  amount: number;
};

export type SalaryDue = {
  month: string;
  due: number; // salaire dû du mois, FCFA entiers
  daysEmployed: number; // jours payés dans le mois (0 = pas employé)
  segments: SalarySegment[]; // un segment par taux appliqué
};

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
 * jours hors fenêtre d'emploi et les jours sans taux ne comptent pas.
 */
export function salaryDueForMonth(
  employee: EmployeeLike,
  rates: SalaryRateLike[],
  month: string
): SalaryDue {
  const days = eachDayOfMonth(month);
  const n = days.length;
  const { from, to, employed } = employmentWindow(employee, month);
  const sorted = [...rates].sort((a, b) =>
    a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0
  );

  // Part de chaque taux, jour par jour, sur le mois ENTIER : un taux qui couvre
  // le mois complet retombe exactement sur son montant.
  const shares = sorted.map((rate) =>
    splitAmount(rate.monthlyAmount, new Array(n).fill(1))
  );

  const byRate = new Map<number, SalarySegment>();
  let due = 0;
  let daysEmployed = 0;
  for (let i = 0; i < n; i++) {
    const day = days[i];
    if (!employed || day < from || day > to) continue;
    daysEmployed += 1;
    let idx = -1;
    for (let r = 0; r < sorted.length; r++) {
      if (sorted[r].startDate <= day) idx = r;
      else break;
    }
    if (idx < 0) continue; // aucun taux défini à cette date : rien n'est dû
    const amount = shares[idx][i];
    due += amount;
    const seg = byRate.get(idx);
    if (seg) {
      seg.days += 1;
      seg.amount += amount;
    } else {
      byRate.set(idx, {
        rateStartDate: sorted[idx].startDate,
        monthlyAmount: sorted[idx].monthlyAmount,
        days: 1,
        amount,
      });
    }
  }

  const segments = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, s]) => s);

  return { month, due, daysEmployed, segments };
}

export type AdvanceLike = {
  month: string; // mois du versement de l'avance
  amount: number; // FCFA
  recoveryMonths?: number; // nombre de mois d'étalement (défaut 1)
};

export type AdvanceRecovery = { month: string; amount: number };

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

export type SalaryMonthSummary = {
  month: string;
  due: number; // salaire dû du mois
  salariesPaid: number; // SALAIRE versés pour ce mois
  advancesPaid: number; // ACOMPTE versés pour ce mois (avance sur le mois)
  advanceGiven: number; // AVANCE versées pendant ce mois
  advanceRecovered: number; // solde d'avance récupéré sur ce mois
  remainingToPay: number; // dû − salaires − acomptes − avances récupérées
  advanceBalance: number; // solde d'avance restant après ce mois
};

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
  months: string[];
}): SalaryMonthSummary[] {
  const { employee, rates, payments } = input;
  const advances: AdvanceState[] = payments
    .filter((p) => p.type === 'AVANCE')
    .map((p) => ({
      month: p.month,
      amount: p.amount,
      parts: advanceRecoverySchedule(p).map((r) => r.amount),
      remaining: p.amount,
    }));
  advances.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  const out: SalaryMonthSummary[] = [];
  for (const month of input.months) {
    const { due } = salaryDueForMonth(employee, rates, month);
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

    out.push({
      month,
      due,
      salariesPaid,
      advancesPaid,
      advanceGiven,
      advanceRecovered: recovered,
      remainingToPay: Math.max(
        0,
        due - salariesPaid - advancesPaid - recovered
      ),
      advanceBalance,
    });
  }
  return out;
}

/**
 * Résumé d'un mois isolé, en rejouant le journal depuis les débuts de
 * l'employé (le solde d'avance dépend des mois antérieurs).
 */
export function summarizeSalaryMonth(input: {
  employee: EmployeeLike;
  rates: SalaryRateLike[];
  payments: SalaryPaymentLike[];
  month: string;
}): SalaryMonthSummary {
  const firstPayment = input.payments.map((p) => p.month).sort()[0];
  const firstRate = input.rates.map((r) => monthOf(r.startDate)).sort()[0];
  const first = [input.month, firstPayment, firstRate]
    .filter((m): m is string => Boolean(m))
    .sort()[0];
  const ledger = salaryLedger({
    ...input,
    months: monthRange(first, input.month),
  });
  return ledger[ledger.length - 1];
}
