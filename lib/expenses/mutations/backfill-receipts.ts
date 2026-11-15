import type { PrismaClient } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import {
  receiptPeriodFromDate,
  formatReceiptNo,
} from '@/lib/expense-numbering';

export async function backfillExpenseReceipts(
  client: PrismaClient = prisma
): Promise<{ updated: number; total: number }> {
  const expenses = await client.expense.findMany({
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      date: true,
      receiptNo: true,
      receiptPeriod: true,
      receiptSeq: true,
    },
  });

  // Plus grande séquence déjà attribuée par mois (pour continuer sans collision).
  const maxSeqByPeriod = new Map<string, number>();
  for (const e of expenses) {
    if (e.receiptPeriod && e.receiptSeq != null) {
      maxSeqByPeriod.set(
        e.receiptPeriod,
        Math.max(maxSeqByPeriod.get(e.receiptPeriod) ?? 0, e.receiptSeq)
      );
    }
  }

  let updated = 0;
  for (const e of expenses) {
    if (e.receiptNo) continue; // déjà numérotée
    const period = receiptPeriodFromDate(e.date);
    const seq = (maxSeqByPeriod.get(period) ?? 0) + 1;
    maxSeqByPeriod.set(period, seq);
    await client.expense.update({
      where: { id: e.id },
      data: {
        receiptPeriod: period,
        receiptSeq: seq,
        receiptNo: formatReceiptNo(period, seq),
      },
    });
    updated++;
  }

  return { updated, total: expenses.length };
}
