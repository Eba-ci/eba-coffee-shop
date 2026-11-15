// lib/stats-compare.ts
//
// Comparaisons de période pour les stats : deltas des KPIs vs période
// précédente (page Statistiques) et jour courant vs hier / même jour semaine
// dernière (Vue d'ensemble). Compose les agrégats existants (`getRangeStats`,
// `getDailyStats`, `getExpenseSummary`) sans nouvelle requête Prisma : les
// conventions (CANCELLED exclues, isPaid, régularisations de recette) restent
// définies à un seul endroit et s'appliquent symétriquement aux deux périodes.

import { cache } from 'react';
import { getDailyStats, getRangeStats } from '@/lib/stats';
import type { DailyStats, RangeStats } from '@/lib/stats';
import { getExpenseSummary } from '@/lib/expenses';
import type { ExpenseSummary } from '@/lib/expenses';
import { todayDailyDate } from '@/lib/daily-numbering';

const DAY_MS = 24 * 60 * 60 * 1000;

export type Delta = {
  current: number;
  previous: number;
  diff: number;
  /** Évolution relative (ex. 0.12 = +12 %). `null` si `previous === 0`. */
  pct: number | null;
};

export function computeDelta(current: number, previous: number): Delta {
  return {
    current,
    previous,
    diff: current - previous,
    pct: previous !== 0 ? (current - previous) / previous : null,
  };
}

/**
 * Période précédente = même durée, se terminant la veille de `from`.
 * Bornes attendues et renvoyées à minuit UTC (jour civil Abidjan), inclusives.
 */
export function previousRange(from: Date, to: Date): { from: Date; to: Date } {
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const prevTo = new Date(from.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY_MS);
  return { from: prevFrom, to: prevTo };
}

export type RangeComparison = {
  current: RangeStats;
  previous: RangeStats;
  previousFrom: Date;
  previousTo: Date;
  expenses: { current: ExpenseSummary; previous: ExpenseSummary };
  deltas: {
    revenue: Delta;
    totalOrders: Delta;
    avgBasket: Delta;
    expenses: Delta;
    netMargin: Delta;
    /** Taux d'annulation comparé en points (0..1), pas en % relatif. */
    cancellationRatePts: { current: number; previous: number; diffPts: number };
  };
};

/**
 * KPIs de la plage `[from, to]` comparés à la période précédente de même
 * durée. Le CA des deux périodes est NET : régularisations de recette ajoutées,
 * remboursements déduits (via `getRangeStats`) ; la marge nette = CA − dépenses (investissements exclus,
 * même convention que la page Statistiques).
 */
export async function compareRanges(
  from: Date,
  to: Date
): Promise<RangeComparison> {
  const prev = previousRange(from, to);
  const [current, previous, curExpenses, prevExpenses] = await Promise.all([
    getRangeStats(from, to),
    getRangeStats(prev.from, prev.to),
    getExpenseSummary(from, to),
    getExpenseSummary(prev.from, prev.to),
  ]);

  return {
    current,
    previous,
    previousFrom: prev.from,
    previousTo: prev.to,
    expenses: { current: curExpenses, previous: prevExpenses },
    deltas: {
      revenue: computeDelta(current.revenue, previous.revenue),
      totalOrders: computeDelta(current.totalOrders, previous.totalOrders),
      avgBasket: computeDelta(current.avgBasket, previous.avgBasket),
      expenses: computeDelta(curExpenses.total, prevExpenses.total),
      netMargin: computeDelta(
        current.revenue - curExpenses.total,
        previous.revenue - prevExpenses.total
      ),
      cancellationRatePts: {
        current: current.cancellationRate,
        previous: previous.cancellationRate,
        diffPts: current.cancellationRate - previous.cancellationRate,
      },
    },
  };
}

/**
 * `compareRanges` dédupliqué via `cache()` : la page Statistiques (Phase 2)
 * l'appelle depuis plusieurs sections Suspense indépendantes (`kpi-section`,
 * `breakdowns-section`) avec les mêmes `from`/`to` — sans ce wrapper, ça
 * doublerait la charge DB (2× `getRangeStats` + `getExpenseSummary`).
 */
export const compareRangesCached = cache(compareRanges);

export type DayComparison = {
  today: DailyStats;
  yesterday: DailyStats;
  sameDayLastWeek: DailyStats;
  vsYesterday: { revenue: Delta; orders: Delta };
  vsLastWeek: { revenue: Delta; orders: Delta };
};

/**
 * Stats du jour comparées à hier et au même jour de la semaine dernière.
 * Attention : le jour courant est partiel alors que les jours de référence
 * sont complets — la comparaison est structurellement pessimiste en cours de
 * journée (biais assumé, à refléter dans le label UI « vs hier »).
 */
export async function compareDays(
  date: Date = todayDailyDate()
): Promise<DayComparison> {
  const yesterday = new Date(date.getTime() - DAY_MS);
  const lastWeek = new Date(date.getTime() - 7 * DAY_MS);
  const [today, yStats, wStats] = await Promise.all([
    getDailyStats(date),
    getDailyStats(yesterday),
    getDailyStats(lastWeek),
  ]);

  return {
    today,
    yesterday: yStats,
    sameDayLastWeek: wStats,
    vsYesterday: {
      revenue: computeDelta(today.revenue, yStats.revenue),
      orders: computeDelta(today.totalOrders, yStats.totalOrders),
    },
    vsLastWeek: {
      revenue: computeDelta(today.revenue, wStats.revenue),
      orders: computeDelta(today.totalOrders, wStats.totalOrders),
    },
  };
}
