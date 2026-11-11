// lib/fixed-costs/queries.ts
//
// Lecture : liste des charges fixes, rapport de point mort sur une plage, et
// périodes échues sans dépense saisie. La logique de calcul vit dans
// `compute.ts` / `missing.ts` (pures).

import { FIXED_COST_LATE_LOOKBACK_DAYS } from '@/config/constants';
import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { getPickupSettings } from '@/lib/pickup-settings-db';
import { getDailySeries } from '@/lib/stats';
import { getMarginAggregate } from '@/lib/stats/margin';
import {
  formatLocalDateOnly,
  parseDateOnlyToUTC,
  shiftDateString,
  todayDateString,
} from '@/lib/timezone';
import { getMonthlySalaryTotal } from '@/lib/salaries/queries';
import { monthRange } from '@/lib/salaries/month';
import {
  buildBreakEvenSeries,
  computeMarginRate,
  type BreakEvenDay,
  type FixedCostLike,
  type MarginRate,
} from './compute';
import { formatDay } from './format';
import { monthBounds } from './month';
import { openDayPredicate } from './open-days';
import { weekBounds } from './payments';
import {
  occurrenceAt,
  scheduleForRange,
  toInstallmentLike,
  type InstallmentLike,
  type LinkedPayment,
  type Occurrence,
  type ScheduledCost,
} from './schedule';

/** Fenêtre (jours) sur laquelle on mesure le taux de marge. */
export const MARGIN_WINDOW_DAYS = 30;
/** Plage maximale d'un rapport (jours) : borne le tableau, le graphique et le MCP. */
export const MAX_REPORT_DAYS = 366;

export type FixedCostRow = FixedCostLike & {
  categoryId: string;
  categoryName: string;
  recurringExpenseId: string | null;
  note: string | null;
  /** Vide = échéance par défaut déduite de la prise d'effet. */
  installments: InstallmentLike[];
};

export async function listFixedCosts(): Promise<FixedCostRow[]> {
  const rows = await prisma.fixedCost.findMany({
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    include: {
      category: { select: { name: true } },
      installments: {
        orderBy: [{ monthOffset: 'asc' }, { day: 'asc' }],
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    amount: r.amount,
    periodicity: r.periodicity,
    startDate: formatLocalDateOnly(r.startDate),
    endDate: r.endDate ? formatLocalDateOnly(r.endDate) : null,
    active: r.active,
    categoryId: r.categoryId,
    categoryName: r.category.name,
    recurringExpenseId: r.recurringExpenseId,
    note: r.note,
    installments: r.installments.map(toInstallmentLike),
  }));
}

export type BreakEvenReport = {
  from: string;
  to: string;
  days: BreakEvenDay[];
  /** Jour courant s'il est dans la plage. */
  today: BreakEvenDay | null;
  margin: MarginRate & { windowFrom: string; windowTo: string };
  totals: {
    openDays: number;
    revenue: number;
    fixedCost: number;
    grossMargin: number | null;
    result: number | null;
    daysReached: number;
  };
  /**
   * Total des salaires de la plage (agrégat mensuel, sans aucun détail). Un
   * seul nombre franchit cette frontière : jamais un nom ni un montant par
   * employé.
   */
  salaryTotal: number;
  /** Aucun jour ouvré dans les horaires : rien à répartir. */
  hoursMissing: boolean;
  /** La plage demandée dépassait MAX_REPORT_DAYS : `from` a été ramené. */
  clamped: boolean;
  costCount: number;
};

export async function getBreakEvenReport(
  requestedFrom: string,
  to: string
): Promise<BreakEvenReport> {
  const earliest = shiftDateString(to, -(MAX_REPORT_DAYS - 1));
  const clamped = requestedFrom < earliest;
  const from = clamped ? earliest : requestedFrom;
  const today = todayDateString();
  const windowTo = to < today ? to : today;
  const windowFrom = shiftDateString(windowTo, -(MARGIN_WINDOW_DAYS - 1));
  const [settings, costs, series, agg] = await Promise.all([
    getPickupSettings(),
    listFixedCosts(),
    getDailySeries(parseDateOnlyToUTC(from)!, parseDateOnlyToUTC(to)!),
    getMarginAggregate(
      parseDateOnlyToUTC(windowFrom)!,
      parseDateOnlyToUTC(windowTo)!
    ),
  ]);
  const isOpen = openDayPredicate(settings);
  const margin = computeMarginRate(agg);
  // Un nombre global de salaires par mois, jamais un détail : le point mort
  // lisse ce total sur les jours ouvrés, comme une charge MONTHLY.
  const salaryPairs = await Promise.all(
    monthRange(from.slice(0, 7), to.slice(0, 7)).map(
      async (m) => [m, await getMonthlySalaryTotal(m)] as const
    )
  );
  const salariesByMonth = Object.fromEntries(salaryPairs) as Record<
    string,
    number
  >;
  const salaryTotal = salaryPairs.reduce((sum, [, v]) => sum + v, 0);
  const days = buildBreakEvenSeries({
    days: series.map((p) => ({ date: p.date, revenue: p.revenue })),
    costs,
    isOpen,
    marginRate: margin.rate,
    salariesByMonth,
  });

  const open = days.filter((d) => d.open);
  const sum = (f: (d: BreakEvenDay) => number) =>
    days.reduce((a, d) => a + f(d), 0);
  const grossMargin =
    margin.rate === null ? null : sum((d) => d.grossMargin ?? 0);
  const fixedCost = sum((d) => d.fixedCost);
  return {
    from,
    to,
    days,
    today: days.find((d) => d.date === today) ?? null,
    margin: { ...margin, windowFrom, windowTo },
    totals: {
      openDays: open.length,
      revenue: sum((d) => d.revenue),
      fixedCost,
      grossMargin,
      result: grossMargin === null ? null : grossMargin - fixedCost,
      daysReached: days.filter((d) => d.reached === true).length,
    },
    salaryTotal,
    hoursMissing: isAllClosed(settings, from),
    clamped,
    costCount: costs.filter((c) => c.active).length,
  };
}

function isAllClosed(
  settings: Awaited<ReturnType<typeof getPickupSettings>>,
  anchor: string
) {
  const isOpen = openDayPredicate(settings);
  for (let i = 0; i < 7; i++)
    if (isOpen(shiftDateString(anchor, i))) return false;
  return true;
}

/** Rapport d'un mois civil `YYYY-MM` (navigation de l'onglet Point mort). */
export async function getMonthReport(month: string): Promise<BreakEvenReport> {
  const { from, to } = monthBounds(month);
  return getBreakEvenReport(from, to);
}

/** Dépenses liées à une occurrence de charge fixe dont l'échéance est dans la plage. */
async function listLinkedPayments(
  from: string,
  to: string
): Promise<LinkedPayment[]> {
  const rows = await prisma.expense.findMany({
    where: {
      fixedCostId: { not: null },
      dueDate: { gte: parseDateOnlyToUTC(from)!, lte: parseDateOnlyToUTC(to)! },
    },
    select: { id: true, fixedCostId: true, dueDate: true, amount: true },
  });
  return rows.map((r) => ({
    expenseId: r.id,
    fixedCostId: r.fixedCostId!,
    dueDate: formatLocalDateOnly(r.dueDate!),
    amount: r.amount,
  }));
}

/** Échéancier des charges fixes sur [from, to] : dû / payé / partiel / en retard. */
export async function getFixedCostSchedule(
  from: string,
  to: string
): Promise<Occurrence[]> {
  const costs = (await listFixedCosts()).filter(
    (c) => c.active && c.periodicity !== 'DAILY'
  );
  if (costs.length === 0) return [];
  const payments = await listLinkedPayments(from, to);
  return scheduleForRange(costs, from, to, payments, todayDateString());
}

/** Échéancier d'un mois civil `YYYY-MM`. */
export async function getMonthSchedule(month: string): Promise<Occurrence[]> {
  const { from, to } = monthBounds(month);
  return getFixedCostSchedule(from, to);
}

/** Vue « paiements » d'un mois : échéances du mois, de la semaine et retards. */
export type PaymentsView = {
  /** Toutes les échéances du mois affiché (payées comprises). */
  month: Occurrence[];
  /** Échéances de la semaine civile en cours (lundi → dimanche). */
  week: Occurrence[];
  /** Échéances échues pas entièrement réglées (tous mois confondus). */
  late: Occurrence[];
  /** Total GLOBAL des salaires du mois (un nombre, sans employé). */
  salaryTotal: number;
};

export async function getPaymentsView(month: string): Promise<PaymentsView> {
  const { from, to } = weekBounds(todayDateString());
  const [monthOcc, week, late, salaryTotal] = await Promise.all([
    getMonthSchedule(month),
    getFixedCostSchedule(from, to),
    getLateFixedCostOccurrences(),
    getMonthlySalaryTotal(month),
  ]);
  return { month: monthOcc, week, late, salaryTotal };
}

/** Occurrence précise d'une charge à une date d'échéance (pré-remplissage). */
export async function getFixedCostOccurrence(
  costId: string,
  dueDate: string
): Promise<Occurrence | null> {
  const schedule = await getFixedCostSchedule(dueDate, dueDate);
  return schedule.find((o) => o.costId === costId) ?? null;
}

/**
 * Échéances passées pas entièrement réglées, y compris partielles (remplace l'alerte « aucune dépense
 * de la catégorie », fausse quand deux charges partagent une catégorie).
 */
export async function getLateFixedCostOccurrences(): Promise<Occurrence[]> {
  const today = todayDateString();
  const yesterday = shiftDateString(today, -1);
  const schedule = await getFixedCostSchedule(
    shiftDateString(today, -FIXED_COST_LATE_LOOKBACK_DAYS),
    yesterday
  );
  return schedule.filter((o) => o.overdue);
}

/**
 * Valide qu'un paiement lié peut être enregistré sur l'échéance `dueDate`
 * d'une charge : la charge existe, `dueDate` est une VRAIE échéance, et la
 * somme des paiements liés ne dépasse pas le montant de l'échéance (refus du
 * double paiement). Lève une erreur française, jamais silencieuse.
 */
export async function assertLinkedPaymentAllowed(
  db: Prisma.TransactionClient,
  costId: string,
  dueDate: string,
  amount: number
): Promise<void> {
  const cost = await db.fixedCost.findUnique({
    where: { id: costId },
    include: { installments: true },
  });
  if (!cost)
    throw new Error(
      'Charge fixe introuvable : le paiement ne peut pas y être lié.'
    );

  const scheduled: ScheduledCost = {
    id: cost.id,
    label: cost.label,
    amount: cost.amount,
    periodicity: cost.periodicity,
    startDate: formatLocalDateOnly(cost.startDate),
    endDate: cost.endDate ? formatLocalDateOnly(cost.endDate) : null,
    active: cost.active,
    categoryId: cost.categoryId,
    installments: cost.installments.map(toInstallmentLike),
  };
  const occurrence = occurrenceAt(scheduled, dueDate, todayDateString());
  if (!occurrence)
    throw new Error(
      `Le ${formatDay(dueDate)} n’est pas une échéance de la charge « ${cost.label} ».`
    );

  const agg = await db.expense.aggregate({
    where: { fixedCostId: costId, dueDate: parseDateOnlyToUTC(dueDate) },
    _sum: { amount: true },
  });
  const already = agg._sum.amount ?? 0;
  if (already + amount > occurrence.amount)
    throw new Error(
      `Le paiement dépasserait l’échéance « ${cost.label} » : ${already} F déjà réglés sur ${occurrence.amount} F.`
    );
}
