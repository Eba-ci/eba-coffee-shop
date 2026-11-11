// app/api/export/bank-report/route.ts
//
// Export Excel (.xlsx) du rapport bancaire consolidé : synthèse CA/dépenses/
// marge, CA quotidien, ventes par produit, dépenses par catégorie,
// investissements/apports, clients & fidélité — sur une plage de dates.
// Réservé aux rôles stats (cf. app/(dashboard)/dashboard/statistiques).

import type { NextRequest } from 'next/server';
import { getCurrentSession, ROLE_GROUPS } from '@/lib/auth-helpers';
import { getRangeStats, getDailySeries, getTopProducts } from '@/lib/stats';
import { previousRange } from '@/lib/stats-compare';
import { getExpenseSummary } from '@/lib/expenses';
import { getInvestmentSummary } from '@/lib/investments';
import { getCustomerRangeStats } from '@/lib/stats-customers';
import { getRevenueAdjustmentSummary } from '@/lib/revenue-adjustments';
import { buildBankReportWorkbook } from '@/lib/stats-excel';
import { xlsxResponse } from '@/lib/excel';
import {
  parseDateOnlyToUTC,
  todayDateString,
  shiftDateString,
} from '@/lib/timezone';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_RANGE_DAYS = 30;
const TOP_PRODUCTS_LIMIT = 50;

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || !ROLE_GROUPS.STATS.includes(session.user.role)) {
    return new Response('Non autorisé', { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const isAll = sp.get('all') === '1';
  const today = todayDateString();
  const defaultFrom = shiftDateString(today, -(DEFAULT_RANGE_DAYS - 1));

  let fromStr = parseDateOnlyToUTC(sp.get('from') ?? undefined)
    ? sp.get('from')!
    : defaultFrom;
  let toStr = parseDateOnlyToUTC(sp.get('to') ?? undefined)
    ? sp.get('to')!
    : today;
  if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];

  const from = parseDateOnlyToUTC(fromStr)!;
  const to = parseDateOnlyToUTC(toStr)!;

  const [
    range,
    dailySeries,
    topProducts,
    expenseSummary,
    investmentSummary,
    customerStats,
    revenueAdjustments,
  ] = await Promise.all([
    getRangeStats(from, to),
    getDailySeries(from, to),
    getTopProducts(from, to, TOP_PRODUCTS_LIMIT),
    getExpenseSummary(from, to, {
      includeSalary: session.user.role === 'ADMIN',
    }),
    getInvestmentSummary(from, to),
    getCustomerRangeStats(from, to),
    getRevenueAdjustmentSummary(from, to),
  ]);

  let previousRangeStats = null;
  if (!isAll) {
    const prev = previousRange(from, to);
    previousRangeStats = await getRangeStats(prev.from, prev.to);
  }

  const buffer = buildBankReportWorkbook({
    fromStr,
    toStr,
    isAll,
    range,
    previousRange: previousRangeStats,
    dailySeries,
    topProducts,
    expenseSummary,
    investmentSummary,
    customerStats,
    revenueAdjustments,
  });

  const filename = isAll
    ? 'rapport_bancaire_depuis_origine.xlsx'
    : `rapport_bancaire_${fromStr}_${toStr}.xlsx`;
  return xlsxResponse(filename, buffer);
}
