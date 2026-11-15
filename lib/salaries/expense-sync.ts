// lib/salaries/expense-sync.ts
//
// Seul écrivain des lignes globales de masse salariale. Appelé DANS la
// transaction de chaque écriture de versement, avec les clés (date, mode)
// touchées : l'ancienne ET la nouvelle quand un versement change de jour ou de
// mode. Le coût est borné par le nombre de clés distinctes (1 à 2 en pratique,
// même pour un règlement de 12 mois d'arriéré), jamais par le nombre de
// versements : une requête de sommes, un verrou, un chargement des lignes
// existantes, puis une écriture par clé.

import { Prisma } from '@/generated/prisma/client';
import type { ExpensePaymentMethod } from '@/generated/prisma/client';
import {
  RECEIPT_NUMBER_MAX_RETRIES,
  formatReceiptNo,
  getNextReceiptSeq,
  receiptPeriodFromDate,
} from '@/lib/expense-numbering';
import {
  getSalaryCategoryId,
  salaryAggregateFields,
  salaryAggregateKey,
} from './expense';

export type SalaryExpenseKey = {
  date: Date;
  paymentMethod: ExpensePaymentMethod;
};

type Existing = { id: string; amount: number; salaryAggregateKey: string };

/** Dédoublonne et ordonne les clés (ordre de verrouillage déterministe). */
export function normalizeKeys(keys: SalaryExpenseKey[]): SalaryExpenseKey[] {
  const byKey = new Map<string, SalaryExpenseKey>();
  for (const k of keys) {
    byKey.set(salaryAggregateKey(k.date, k.paymentMethod), k);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, k]) => k);
}

export async function syncSalaryExpenses(
  tx: Prisma.TransactionClient,
  rawKeys: SalaryExpenseKey[],
  createdById: string | null
): Promise<void> {
  const keys = normalizeKeys(rawKeys);
  if (keys.length === 0) return;
  const keyStrings = keys.map((k) =>
    salaryAggregateKey(k.date, k.paymentMethod)
  );

  // 1. Verrou des lignes existantes (ordre des clés) puis lecture : une seule
  //    requête, deux synchronisations concurrentes s'attendent au lieu de
  //    s'écraser.
  const existing = await tx.$queryRaw<Existing[]>(Prisma.sql`
    SELECT "id", "amount", "salaryAggregateKey"
    FROM "expense"
    WHERE "salaryAggregateKey" = ANY(${keyStrings}::text[])
    ORDER BY "salaryAggregateKey"
    FOR UPDATE
  `);
  const existingByKey = new Map(existing.map((e) => [e.salaryAggregateKey, e]));

  // 2. Somme des versements de TOUTES les clés en une requête.
  const sums = await tx.salaryPayment.groupBy({
    by: ['date', 'paymentMethod'],
    where: {
      canceledAt: null,
      OR: keys.map((k) => ({ date: k.date, paymentMethod: k.paymentMethod })),
    },
    _sum: { amount: true },
  });
  const totalByKey = new Map(
    sums.map((s) => [
      salaryAggregateKey(s.date, s.paymentMethod),
      s._sum.amount ?? 0,
    ])
  );

  const categoryId = keys.some((k, i) => {
    return (
      (totalByKey.get(keyStrings[i]) ?? 0) > 0 &&
      !existingByKey.has(keyStrings[i])
    );
  })
    ? await getSalaryCategoryId(tx)
    : null;

  const toDelete: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const ks = keyStrings[i];
    const total = totalByKey.get(ks) ?? 0;
    const current = existingByKey.get(ks);

    if (total <= 0) {
      if (current) toDelete.push(current.id);
      continue;
    }

    let expenseId: string;
    if (current) {
      expenseId = current.id;
      if (current.amount !== total) {
        await tx.expense.update({
          where: { id: current.id },
          data: { amount: total },
        });
      }
    } else {
      const period = receiptPeriodFromDate(key.date);
      const seq = await getNextReceiptSeq(tx, period);
      const created = await tx.expense.create({
        data: {
          ...salaryAggregateFields(key.date, key.paymentMethod, total),
          categoryId: categoryId!,
          createdById,
          receiptPeriod: period,
          receiptSeq: seq,
          receiptNo: formatReceiptNo(period, seq),
        },
        select: { id: true },
      });
      expenseId = created.id;
    }

    // Rattache les versements du jour/mode (ceux déjà liés ne sont pas
    // réécrits). Passe AVANT les suppressions : un versement déplacé quitte
    // d'abord son ancienne ligne.
    await tx.salaryPayment.updateMany({
      where: {
        canceledAt: null,
        date: key.date,
        paymentMethod: key.paymentMethod,
        OR: [{ expenseId: null }, { expenseId: { not: expenseId } }],
      },
      data: { expenseId },
    });
  }

  if (toDelete.length > 0) {
    await tx.expense.deleteMany({ where: { id: { in: toDelete } } });
  }
}

/** Clé d'un versement tel que stocké (pour l'ancienne position d'un déplacé). */
export function keyOf(p: {
  date: Date;
  paymentMethod: ExpensePaymentMethod;
}): SalaryExpenseKey {
  return { date: p.date, paymentMethod: p.paymentMethod };
}

/**
 * Rejoue une transaction qui a perdu une course sur le numéro de reçu ou la clé
 * de la ligne globale (P2002) : la relecture donne un résultat cohérent.
 */
export async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const unique =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002';
      if (!unique || attempt >= RECEIPT_NUMBER_MAX_RETRIES - 1) throw err;
    }
  }
}

/**
 * Recrée TOUTES les lignes globales depuis les versements (idempotent) : après
 * la migration qui retire les anciennes dépenses « miroir », ou pour réparer
 * une dérive. Une transaction par clé distincte (jamais une par versement) ; les
 * clés sont lues en UNE requête groupée.
 */
export async function resyncAllSalaryExpenses(
  client: Prisma.TransactionClient & {
    $transaction: <T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>
    ) => Promise<T>;
  }
): Promise<{ keys: number }> {
  const groups = await client.salaryPayment.groupBy({
    by: ['date', 'paymentMethod'],
    where: { canceledAt: null },
  });
  // Lignes globales sans versement (données retirées à la main) : à purger.
  const orphanKeys = await client.expense.findMany({
    where: { salaryAggregateKey: { not: null }, salaryPayments: { none: {} } },
    select: { salaryAggregateKey: true, date: true, paymentMethod: true },
  });
  const keys = normalizeKeys([
    ...groups.map((g) => ({ date: g.date, paymentMethod: g.paymentMethod })),
    ...orphanKeys.map((o) => ({
      date: o.date,
      paymentMethod: o.paymentMethod,
    })),
  ]);
  for (const key of keys) {
    await withRetry(() =>
      client.$transaction((tx) => syncSalaryExpenses(tx, [key], null))
    );
  }
  return { keys: keys.length };
}
