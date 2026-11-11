// app/api/export/expense-items/route.ts
//
// Export CSV du détail des dépenses par article : une ligne par ExpenseItem,
// avec sa dépense (reçu, date, catégorie, paiement, fournisseur). Sert
// l'analyse de fréquence d'achat hors dashboard (tableur).
// Rôles finance : ADMIN, MANAGER, COMPTABLE.

import type { NextRequest } from 'next/server';
import { getCurrentSession, ROLE_GROUPS } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
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

  const lines = await prisma.expenseItem.findMany({
    where: {
      // Confidentialité : les lignes de salaire (réservées à l'ADMIN) n'ont pas
      // de détail d'article, et ne doivent jamais transiter par cet export.
      expense: {
        salaryPaymentId: null,
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
    },
    orderBy: [{ expense: { date: 'desc' } }, { sortOrder: 'asc' }],
    select: {
      rawLabel: true,
      label: true,
      formatQty: true,
      formatSize: true,
      unit: true,
      qtyBase: true,
      unitPrice: true,
      amount: true,
      pendingQuantity: true,
      article: { select: { name: true, baseUnit: true } },
      expense: {
        select: {
          receiptNo: true,
          date: true,
          supplier: true,
          paymentMethod: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  const headers = [
    'N° reçu',
    'Date',
    'Catégorie',
    'Article',
    'Libellé brut',
    'Précision',
    'Qté achat',
    'Format',
    'Unité achat',
    'Qté (unité de base)',
    'Unité de base',
    'PU (FCFA)',
    'Montant (FCFA)',
    'Qté à renseigner',
    'Paiement',
    'Fournisseur',
  ];
  const rows = lines.map((l) => [
    l.expense.receiptNo ?? '',
    formatLocalDateOnly(l.expense.date),
    l.expense.category.name,
    l.article?.name ?? '',
    l.rawLabel,
    l.label ?? '',
    l.formatQty?.toNumber() ?? '',
    l.formatSize?.toNumber() ?? '',
    l.unit ?? '',
    l.qtyBase?.toNumber() ?? '',
    l.article?.baseUnit ?? '',
    l.unitPrice ?? '',
    l.amount,
    l.pendingQuantity,
    PAYMENT_LABELS[l.expense.paymentMethod] ?? l.expense.paymentMethod,
    l.expense.supplier ?? '',
  ]);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  rows.push([
    '',
    '',
    '',
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    total,
    '',
    '',
    '',
  ]);

  return csvResponse(
    `depenses_articles_${fromStr}_${toStr}.csv`,
    toCsv(headers, rows)
  );
}
