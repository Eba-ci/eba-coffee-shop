// lib/fixed-costs/queries.ts
//
// Lecture : rapport de point mort sur une plage et périodes échues sans dépense
// saisie. La logique de calcul vit dans `compute.ts` / `missing.ts` (pures) ;
// la lecture du calendrier des paiements dans `payments-queries.ts`, réexportée
// ici pour ne pas changer l'API publique.

import { getPickupSettings } from '@/lib/pickup-settings-db';
import { getDailySeries } from '@/lib/stats';
import { getMarginAggregate } from '@/lib/stats/margin';
import {
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
  type MarginRate,
} from './compute';
import { monthBounds } from './month';
import { openDayPredicate } from './open-days';
import { listFixedCosts } from './payments-queries';

export { listFixedCosts };
export {
  getFixedCostSchedule,
  getMonthSchedule,
  getPaymentsView,
  getFixedCostOccurrence,
  getLateFixedCostOccurrences,
  assertLinkedPaymentAllowed,
} from './payments-queries';
export type { FixedCostRow, PaymentsView } from './payments-queries';

/** Fenêtre (jours) sur laquelle on mesure le taux de marge. */
export const MARGIN_WINDOW_DAYS = 30;
/** Plage maximale d'un rapport (jours) : borne le tableau, le graphique et le MCP. */
export const MAX_REPORT_DAYS = 366;

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
