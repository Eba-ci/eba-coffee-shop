// lib/fixed-costs/payments-queries.ts
//
// Lectures liées au calendrier des paiements : charges fixes, échéancier dû /
// payé / partiel / en retard, et contrôle du règlement lié. Extrait de
// `queries.ts` (plafond de 300 lignes) ; `queries.ts` réexporte l'API publique.

import { FIXED_COST_LATE_LOOKBACK_DAYS } from '@/config/constants';
import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { getMonthlySalaryTotal } from '@/lib/salaries/queries';
import {
  formatLocalDateOnly,
  parseDateOnlyToUTC,
  shiftDateString,
  todayDateString,
} from '@/lib/timezone';
import type { FixedCostLike } from './compute';
import { formatDay } from './format';
import { monthBounds } from './month';
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

export type FixedCostRow = FixedCostLike & {
  categoryId: string;
  categoryName: string;
  recurringExpenseId: string | null;
  note: string | null;
  sortOrder: number;
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
    sortOrder: r.sortOrder,
    installments: r.installments.map(toInstallmentLike),
  }));
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

/**
 * Échéancier des charges fixes sur [from, to] : dû / payé / partiel / en retard.
 * `costs` permet de réutiliser une liste déjà chargée (un seul `listFixedCosts`
 * par rendu).
 */
export async function getFixedCostSchedule(
  from: string,
  to: string,
  costs?: FixedCostRow[]
): Promise<Occurrence[]> {
  const all = costs ?? (await listFixedCosts());
  const active = all.filter((c) => c.active && c.periodicity !== 'DAILY');
  if (active.length === 0) return [];
  const payments = await listLinkedPayments(from, to);
  return scheduleForRange(active, from, to, payments, todayDateString());
}

/** Échéancier d'un mois civil `YYYY-MM`. */
export async function getMonthSchedule(
  month: string,
  costs?: FixedCostRow[]
): Promise<Occurrence[]> {
  const { from, to } = monthBounds(month);
  return getFixedCostSchedule(from, to, costs);
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
  // Une seule lecture des charges pour les trois vues (mois, semaine, retards).
  const costs = await listFixedCosts();
  const { from, to } = weekBounds(todayDateString());
  const [monthOcc, week, late, salaryTotal] = await Promise.all([
    getMonthSchedule(month, costs),
    getFixedCostSchedule(from, to, costs),
    getLateFixedCostOccurrences(costs),
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
export async function getLateFixedCostOccurrences(
  costs?: FixedCostRow[]
): Promise<Occurrence[]> {
  const today = todayDateString();
  const yesterday = shiftDateString(today, -1);
  const schedule = await getFixedCostSchedule(
    shiftDateString(today, -FIXED_COST_LATE_LOOKBACK_DAYS),
    yesterday,
    costs
  );
  return schedule.filter((o) => o.overdue);
}

/**
 * Valide qu'un paiement lié peut être enregistré sur l'échéance `dueDate`
 * d'une charge : la charge existe, `dueDate` est une VRAIE échéance, et la
 * somme des paiements liés ne dépasse pas le montant de l'échéance (refus du
 * double paiement). Lève une erreur française, jamais silencieuse.
 *
 * Sûr en concurrence : la ligne de la charge fixe est verrouillée
 * (`SELECT … FOR UPDATE`) AVANT de lire l'agrégat des paiements, donc deux
 * créations simultanées sur la même charge sont sérialisées et la seconde voit
 * le cumul de la première.
 */
export async function assertLinkedPaymentAllowed(
  db: Prisma.TransactionClient,
  costId: string,
  dueDate: string,
  amount: number
): Promise<void> {
  // Verrou de ligne tenu jusqu'à la fin de la transaction. En READ COMMITTED,
  // l'agrégat qui suit relit l'état validé par la transaction concurrente.
  await db.$queryRaw`SELECT "id" FROM "fixed_cost" WHERE "id" = ${costId} FOR UPDATE`;

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
