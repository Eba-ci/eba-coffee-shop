// lib/fixed-costs/links-mutations.ts
//
// Liaison / déliaison dépense ↔ échéance (#453). La validation est refaite ICI,
// côté serveur (catégorie, échéance réelle, une seule occurrence par dépense,
// pas de salaire). Un lot est ATOMIQUE : une erreur annule tout. Chaque
// écriture est tracée dans `FixedCostLinkEvent` (qui, quoi, quand).
//
// Le statut d'une échéance n'est jamais stocké : il se recalcule à la lecture.
// Plusieurs dépenses peuvent régler la même occurrence (leur somme décide) ;
// un excédent est ASSUMÉ (décision de l'épique #461 : montant unique).

import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  formatLocalDateOnly,
  parseDateOnlyToUTC,
  todayDateString,
} from '@/lib/timezone';
import { linkError } from './link-rules';
import {
  occurrenceAt,
  statusOf,
  toInstallmentLike,
  type OccurrenceStatus,
  type ScheduledCost,
} from './schedule';

export const LINK_BATCH_MAX = 100;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD');
export const linkTargetSchema = z.object({
  expenseId: z.string().min(1),
  costId: z.string().min(1),
  dueDate: dateOnly,
});
export const linkBatchSchema = z
  .array(linkTargetSchema)
  .min(1, 'Aucune liaison demandée.')
  .max(LINK_BATCH_MAX, `${LINK_BATCH_MAX} liaisons au maximum.`);
export type LinkTarget = z.infer<typeof linkTargetSchema>;

export type LinkActor = { userId: string | null; source: 'STAFF' | 'MCP' };

export type LinkOutcome = LinkTarget & {
  /** `already` : liaison déjà en place (rejeu sans effet). */
  result: 'linked' | 'already';
  occurrenceAmount: number;
  paidAfter: number;
  statusAfter: OccurrenceStatus;
};

const toDate = (v: string) => parseDateOnlyToUTC(v)!;

export async function linkExpenses(
  input: unknown,
  actor: LinkActor,
  opts: { dryRun?: boolean } = {}
): Promise<LinkOutcome[]> {
  const targets = linkBatchSchema.parse(input);
  const today = todayDateString();

  return prisma.$transaction(async (tx) => {
    // Verrou des charges visées, toujours dans l'ordre des identifiants.
    const costIds = [...new Set(targets.map((t) => t.costId))].sort();
    await tx.$queryRaw`SELECT "id" FROM "fixed_cost" WHERE "id" = ANY(${costIds}) ORDER BY "id" FOR UPDATE`;

    const [costs, expenses] = await Promise.all([
      tx.fixedCost.findMany({
        where: { id: { in: costIds } },
        include: { installments: true },
      }),
      tx.expense.findMany({
        where: { id: { in: [...new Set(targets.map((t) => t.expenseId))] } },
        select: {
          id: true,
          categoryId: true,
          fixedCostId: true,
          dueDate: true,
          amount: true,
          salaryAggregateKey: true,
          salaryPayments: { select: { id: true }, take: 1 },
        },
      }),
    ]);
    const costById = new Map(costs.map((c) => [c.id, c]));
    const expenseById = new Map(expenses.map((e) => [e.id, e]));

    const seen = new Set<string>();
    const planned: (LinkTarget & { already: boolean; amount: number })[] = [];
    for (const t of targets) {
      if (seen.has(t.expenseId))
        throw new Error(
          'Une dépense ne peut être liée qu’à une seule échéance.'
        );
      seen.add(t.expenseId);
      const cost = costById.get(t.costId) ?? null;
      const expense = expenseById.get(t.expenseId) ?? null;
      const occurrence = cost
        ? occurrenceAt(toScheduled(cost), t.dueDate, today)
        : null;
      const error = linkError(
        expense && {
          id: expense.id,
          categoryId: expense.categoryId,
          fixedCostId: expense.fixedCostId,
          dueDate: expense.dueDate
            ? formatLocalDateOnly(expense.dueDate)
            : null,
          isSalary:
            expense.salaryAggregateKey !== null ||
            expense.salaryPayments.length > 0,
        },
        cost,
        t,
        occurrence !== null
      );
      if (error) throw new Error(error);
      planned.push({
        ...t,
        already: expense!.fixedCostId === t.costId,
        amount: expense!.amount,
      });
    }

    // Cumul déjà lié par occurrence + apport du lot, pour le statut résultant.
    const keys = [...new Set(planned.map((p) => `${p.costId}|${p.dueDate}`))];
    const paid = new Map<string, number>();
    for (const key of keys) {
      const [costId, dueDate] = key.split('|');
      const agg = await tx.expense.aggregate({
        where: { fixedCostId: costId, dueDate: toDate(dueDate) },
        _sum: { amount: true },
      });
      paid.set(key, agg._sum.amount ?? 0);
    }
    for (const p of planned)
      if (!p.already)
        paid.set(
          `${p.costId}|${p.dueDate}`,
          (paid.get(`${p.costId}|${p.dueDate}`) ?? 0) + p.amount
        );

    const outcomes: LinkOutcome[] = [];
    for (const p of planned) {
      const occurrence = occurrenceAt(
        toScheduled(costById.get(p.costId)!),
        p.dueDate,
        today
      )!;
      const paidAfter = paid.get(`${p.costId}|${p.dueDate}`) ?? 0;
      outcomes.push({
        expenseId: p.expenseId,
        costId: p.costId,
        dueDate: p.dueDate,
        result: p.already ? 'already' : 'linked',
        occurrenceAmount: occurrence.amount,
        paidAfter,
        statusAfter: statusOf(p.dueDate, occurrence.amount, paidAfter, today),
      });
      if (opts.dryRun || p.already) continue;
      await tx.expense.update({
        where: { id: p.expenseId },
        data: { fixedCostId: p.costId, dueDate: toDate(p.dueDate) },
      });
      await tx.fixedCostLinkEvent.create({
        data: {
          expenseId: p.expenseId,
          fixedCostId: p.costId,
          dueDate: toDate(p.dueDate),
          action: 'LINK',
          actorId: actor.userId,
          source: actor.source,
        },
      });
    }
    return outcomes;
  });
}

export type UnlinkOutcome = {
  expenseId: string;
  result: 'unlinked' | 'already';
};

/** Défait des liaisons (lot atomique). Rejouable : une dépense libre est ignorée. */
export async function unlinkExpenses(
  expenseIds: unknown,
  actor: LinkActor,
  opts: { dryRun?: boolean } = {}
): Promise<UnlinkOutcome[]> {
  const ids = z
    .array(z.string().min(1))
    .min(1, 'Aucune dépense à délier.')
    .max(LINK_BATCH_MAX)
    .parse(expenseIds);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.expense.findMany({
      where: { id: { in: ids } },
      select: { id: true, fixedCostId: true, dueDate: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: UnlinkOutcome[] = [];
    for (const id of [...new Set(ids)]) {
      const row = byId.get(id);
      if (!row) throw new Error('Dépense introuvable (supprimée ?).');
      if (!row.fixedCostId || !row.dueDate) {
        out.push({ expenseId: id, result: 'already' });
        continue;
      }
      out.push({ expenseId: id, result: 'unlinked' });
      if (opts.dryRun) continue;
      await tx.expense.update({
        where: { id },
        data: { fixedCostId: null, dueDate: null },
      });
      await tx.fixedCostLinkEvent.create({
        data: {
          expenseId: id,
          fixedCostId: row.fixedCostId,
          dueDate: row.dueDate,
          action: 'UNLINK',
          actorId: actor.userId,
          source: actor.source,
        },
      });
    }
    return out;
  });
}

type CostRow = {
  id: string;
  label: string;
  amount: number;
  periodicity: ScheduledCost['periodicity'];
  startDate: Date;
  endDate: Date | null;
  active: boolean;
  categoryId: string;
  installments: { monthOffset: number; day: number; amount: number }[];
};

function toScheduled(c: CostRow): ScheduledCost {
  return {
    id: c.id,
    label: c.label,
    amount: c.amount,
    periodicity: c.periodicity,
    startDate: formatLocalDateOnly(c.startDate),
    endDate: c.endDate ? formatLocalDateOnly(c.endDate) : null,
    active: c.active,
    categoryId: c.categoryId,
    installments: c.installments.map(toInstallmentLike),
  };
}
