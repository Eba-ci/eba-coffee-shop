// app/api/export/expenses/route.ts
//
// Export CSV des dépenses sur une plage de dates + catégorie
// (rôles finance : ADMIN, MANAGER, COMPTABLE).

import type { NextRequest } from 'next/server';
import { getCurrentSession, ROLE_GROUPS } from '@/lib/auth-helpers';
import { listExpenses } from '@/lib/expenses';
import { toCsv, csvResponse } from '@/lib/csv';
import {
  parseDateOnlyToUTC,
  todayDateString,
  shiftDateString,
  formatLocalDateOnly,
} from '@/lib/timezone';

export const dynamic = 'force-dynamic';

const DEFAULT_RANGE_DAYS = 30;

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  BANK: 'Banque',
  OTHER: 'Autre',
};

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || !ROLE_GROUPS.FINANCE.includes(session.user.role)) {
    return new Response('Non autorisé', { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const isAll = sp.get('range') === 'all';
  const today = todayDateString();
  const defaultFrom = shiftDateString(today, -(DEFAULT_RANGE_DAYS - 1));

  let fromStr = 'tout';
  let toStr = 'tout';
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (!isAll) {
    fromStr = parseDateOnlyToUTC(sp.get('from') ?? undefined)
      ? sp.get('from')!
      : defaultFrom;
    toStr = parseDateOnlyToUTC(sp.get('to') ?? undefined)
      ? sp.get('to')!
      : today;
    if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];
    dateFrom = parseDateOnlyToUTC(fromStr);
    dateTo = parseDateOnlyToUTC(toStr);
  }

  const categoryId = sp.get('category') || undefined;
  const paymentParam = sp.get('payment');
  const paymentMethod = (['CASH', 'WAVE', 'BANK', 'OTHER'] as const).includes(
    paymentParam as 'CASH' | 'WAVE' | 'BANK' | 'OTHER'
  )
    ? (paymentParam as 'CASH' | 'WAVE' | 'BANK' | 'OTHER')
    : undefined;
  const search = sp.get('search')?.trim() || undefined;
  const { expenses, total } = await listExpenses({
    dateFrom,
    dateTo,
    categoryId,
    paymentMethod,
    search,
  });

  const headers = [
    'N° reçu',
    'Date',
    'Catégorie',
    'Montant (FCFA)',
    'Paiement',
    'Fournisseur',
    'Note',
    'Justificatif',
  ];
  const rows = expenses.map((e) => [
    e.receiptNo ?? '',
    formatLocalDateOnly(e.date),
    e.category.name,
    e.amount,
    PAYMENT_LABELS[e.paymentMethod] ?? e.paymentMethod,
    e.supplier ?? '',
    e.note ?? '',
    e.receiptUrl ?? '',
  ]);
  // Ligne de total.
  rows.push(['', '', 'TOTAL', total, '', '', '', '']);

  return csvResponse(`depenses_${fromStr}_${toStr}.csv`, toCsv(headers, rows));
}
