// lib/fixed-costs/schedule.ts
//
// Échéancier PUR des charges fixes : quels jours une charge tombe, pour quel
// montant, et où en est chaque occurrence (à venir / payée / partielle / en
// retard). Les occurrences sont CALCULÉES à la lecture, jamais stockées : seule
// la dépense qui règle une occurrence l'est (`Expense.fixedCostId` + `dueDate`).
// Aucune dépendance serveur.
//
// Les charges « par jour ouvré » (DAILY) n'ont pas d'échéance : elles se
// consomment chaque jour, il n'y a rien à suivre.

import type { FixedCostLike } from './compute';
import {
  daysInMonth,
  nextPeriodStart,
  periodContaining,
  weekdayOf,
  type Period,
} from './periods';

export type InstallmentLike = {
  /** Décalage en mois dans la période : trimestre 0..2, année 0..11, sinon 0. */
  monthOffset: number;
  /** Mensuel+ : jour du mois 1..31 (clampé). Hebdo : jour de semaine 1 (lun)..7 (dim). */
  day: number;
  amount: number;
};

export type ScheduledCost = FixedCostLike & {
  categoryId: string;
  /** Vide = une échéance par défaut déduite de `startDate`. */
  installments: InstallmentLike[];
};

/** Dépense réelle qui règle une occurrence. */
export type LinkedPayment = {
  expenseId: string;
  fixedCostId: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
};

export type OccurrenceStatus = 'UPCOMING' | 'PAID' | 'PARTIAL' | 'LATE';

export type Occurrence = {
  costId: string;
  label: string;
  categoryId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  status: OccurrenceStatus;
  expenseIds: string[];
};

/** Garde-fou : une plage ne génère jamais plus de périodes que ça par charge. */
const MAX_PERIODS = 800;

const pad = (n: number) => String(n).padStart(2, '0');

/** Nombre de mois d'une période mensuelle ou plus longue (0 pour hebdo). */
function monthsInPeriod(p: FixedCostLike['periodicity']): number {
  if (p === 'QUARTERLY') return 3;
  if (p === 'YEARLY') return 12;
  return p === 'MONTHLY' ? 1 : 0;
}

/**
 * Échéance par défaut = le jour de la prise d'effet, rapporté à la période :
 * un loyer commencé le 5 tombe le 5 de chaque mois.
 */
export function defaultInstallments(cost: FixedCostLike): InstallmentLike[] {
  const month = Number(cost.startDate.slice(5, 7));
  const day = Number(cost.startDate.slice(8, 10));
  switch (cost.periodicity) {
    case 'DAILY':
      return [];
    case 'WEEKLY': {
      const wd = weekdayOf(cost.startDate);
      return [{ monthOffset: 0, day: wd === 0 ? 7 : wd, amount: cost.amount }];
    }
    case 'MONTHLY':
      return [{ monthOffset: 0, day, amount: cost.amount }];
    case 'QUARTERLY':
      return [{ monthOffset: (month - 1) % 3, day, amount: cost.amount }];
    case 'YEARLY':
      return [{ monthOffset: month - 1, day, amount: cost.amount }];
  }
}

export function effectiveInstallments(cost: ScheduledCost): InstallmentLike[] {
  return cost.installments.length > 0
    ? cost.installments
    : defaultInstallments(cost);
}

/** Jour d'échéance dans `period`, ou null si l'échéance n'a pas de sens ici. */
export function dueDateIn(
  period: Period,
  periodicity: FixedCostLike['periodicity'],
  inst: Pick<InstallmentLike, 'monthOffset' | 'day'>
): string | null {
  if (periodicity === 'DAILY') return null;
  if (periodicity === 'WEEKLY') {
    if (inst.day < 1 || inst.day > 7) return null;
    const [y, m, d] = period.start.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + inst.day - 1));
    return date.toISOString().slice(0, 10);
  }
  if (inst.monthOffset < 0 || inst.monthOffset >= monthsInPeriod(periodicity))
    return null;
  const year = Number(period.start.slice(0, 4));
  const month = Number(period.start.slice(5, 7)) + inst.monthOffset;
  const day = Math.min(Math.max(inst.day, 1), daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

function sumByKey(payments: LinkedPayment[]) {
  const map = new Map<string, { paid: number; ids: string[] }>();
  for (const p of payments) {
    const key = `${p.fixedCostId}|${p.dueDate}`;
    const cur = map.get(key) ?? { paid: 0, ids: [] };
    cur.paid += p.amount;
    cur.ids.push(p.expenseId);
    map.set(key, cur);
  }
  return map;
}

/**
 * Statut d'une occurrence. Payée dès que le total lié couvre le montant ;
 * partielle si une dépense liée existe mais ne suffit pas (même après la date) ;
 * en retard si la date est STRICTEMENT passée sans rien de lié. Le jour même
 * reste « à venir » : la période en cours n'est jamais en retard avant sa date.
 */
export function statusOf(
  dueDate: string,
  amount: number,
  paid: number,
  today: string
): OccurrenceStatus {
  if (paid >= amount) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return dueDate < today ? 'LATE' : 'UPCOMING';
}

/**
 * Occurrences d'une charge dont l'échéance tombe dans [from, to] ET dans sa
 * fenêtre d'effet (prise d'effet → fin incluses). Triées par date.
 */
export function occurrencesInRange(
  cost: ScheduledCost,
  from: string,
  to: string,
  payments: LinkedPayment[],
  today: string
): Occurrence[] {
  if (!cost.active || cost.periodicity === 'DAILY') return [];
  const lo = from > cost.startDate ? from : cost.startDate;
  const hi = cost.endDate && cost.endDate < to ? cost.endDate : to;
  if (lo > hi) return [];

  const paidBy = sumByKey(payments.filter((p) => p.fixedCostId === cost.id));
  const installments = effectiveInstallments(cost);
  const out: Occurrence[] = [];
  let period = periodContaining(lo, cost.periodicity);
  for (let i = 0; i < MAX_PERIODS && period.start <= hi; i++) {
    for (const inst of installments) {
      const dueDate = dueDateIn(period, cost.periodicity, inst);
      if (!dueDate || dueDate < lo || dueDate > hi) continue;
      const hit = paidBy.get(`${cost.id}|${dueDate}`);
      const paid = hit?.paid ?? 0;
      out.push({
        costId: cost.id,
        label: cost.label,
        categoryId: cost.categoryId,
        periodStart: period.start,
        periodEnd: period.end,
        dueDate,
        amount: inst.amount,
        paid,
        remaining: Math.max(inst.amount - paid, 0),
        status: statusOf(dueDate, inst.amount, paid, today),
        expenseIds: hit?.ids ?? [],
      });
    }
    period = periodContaining(nextPeriodStart(period.end), cost.periodicity);
  }
  return out.sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) || a.label.localeCompare(b.label)
  );
}

/** Occurrences de toutes les charges sur [from, to], triées par échéance. */
export function scheduleForRange(
  costs: ScheduledCost[],
  from: string,
  to: string,
  payments: LinkedPayment[],
  today: string
): Occurrence[] {
  return costs
    .flatMap((c) => occurrencesInRange(c, from, to, payments, today))
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.label.localeCompare(b.label)
    );
}

/** Total des échéances : doit égaler le montant de la charge sur la période. */
export function installmentsTotal(installments: InstallmentLike[]): number {
  return installments.reduce((s, i) => s + i.amount, 0);
}
