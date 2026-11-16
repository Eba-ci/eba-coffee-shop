// lib/fixed-costs/links-queries.ts
//
// Lectures du rapprochement dépense ↔ échéance (#453) : dépenses non liées,
// dépenses déjà liées, propositions. Deux requêtes pour un mois, jamais une par
// échéance. Les salaires ne sont JAMAIS lus : ni la ligne globale
// (`salaryAggregateKey`), ni une dépense portée par un versement.

import prisma from '@/lib/prisma';
import { formatLocalDateOnly, parseDateOnlyToUTC } from '@/lib/timezone';
import { proposeOccurrenceLinks, type LinkProposal } from './link-proposals';
import { monthBounds } from './month';
import {
  getFixedCostSchedule,
  getMonthSchedule,
  listFixedCosts,
} from './queries';
import { isSalaryNamed } from './salary-migration';
import type { Occurrence } from './schedule';

export type UnlinkedExpense = {
  id: string;
  date: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  note: string | null;
  supplier: string | null;
};

export type LinkedExpense = {
  id: string;
  date: string;
  amount: number;
  costId: string;
  dueDate: string;
  note: string | null;
};

/** Dépenses libres (ni liées, ni salaire) des catégories, sur [from, to]. */
export async function listUnlinkedFixedExpenses(opts: {
  from: string;
  to: string;
  categoryIds: string[];
}): Promise<UnlinkedExpense[]> {
  if (opts.categoryIds.length === 0) return [];
  const rows = await prisma.expense.findMany({
    where: {
      categoryId: { in: opts.categoryIds },
      fixedCostId: null,
      salaryAggregateKey: null,
      salaryPayments: { none: {} },
      date: {
        gte: parseDateOnlyToUTC(opts.from)!,
        lte: parseDateOnlyToUTC(opts.to)!,
      },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      date: true,
      amount: true,
      categoryId: true,
      note: true,
      supplier: true,
      category: { select: { name: true } },
    },
  });
  return rows
    .filter(
      (r) =>
        !isSalaryNamed({
          label: r.category.name,
          categoryName: r.category.name,
        })
    )
    .map((r) => ({
      id: r.id,
      date: formatLocalDateOnly(r.date),
      amount: r.amount,
      categoryId: r.categoryId,
      categoryName: r.category.name,
      note: r.note,
      supplier: r.supplier,
    }));
}

export type ReconciliationView = {
  month: string;
  occurrences: Occurrence[];
  unlinked: UnlinkedExpense[];
  linked: LinkedExpense[];
  proposals: LinkProposal[];
};

/** Vue de rapprochement d'un mois civil `YYYY-MM`. */
export async function getReconciliation(
  month: string
): Promise<ReconciliationView> {
  const costs = await listFixedCosts();
  const occurrences = await getMonthSchedule(month, costs, {
    includeInactive: true,
  });
  const empty = { month, occurrences, unlinked: [], linked: [], proposals: [] };
  if (occurrences.length === 0) return empty;

  const from = occurrences.reduce(
    (m, o) => (o.periodStart < m ? o.periodStart : m),
    occurrences[0].periodStart
  );
  const to = occurrences.reduce(
    (m, o) => (o.periodEnd > m ? o.periodEnd : m),
    occurrences[0].periodEnd
  );
  const categoryIds = [...new Set(occurrences.map((o) => o.categoryId))];
  const bounds = monthBounds(month);

  const [unlinked, linkedRows] = await Promise.all([
    listUnlinkedFixedExpenses({ from, to, categoryIds }),
    prisma.expense.findMany({
      where: {
        fixedCostId: { not: null },
        dueDate: {
          gte: parseDateOnlyToUTC(bounds.from)!,
          lte: parseDateOnlyToUTC(bounds.to)!,
        },
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        amount: true,
        fixedCostId: true,
        dueDate: true,
        note: true,
      },
    }),
  ]);

  return {
    month,
    occurrences,
    unlinked,
    linked: linkedRows.map((r) => ({
      id: r.id,
      date: formatLocalDateOnly(r.date),
      amount: r.amount,
      costId: r.fixedCostId!,
      dueDate: formatLocalDateOnly(r.dueDate!),
      note: r.note,
    })),
    proposals: proposeOccurrenceLinks(unlinked, occurrences),
  };
}

/** Propositions sur une plage libre (MCP) : dépenses libres × échéances. */
export async function getLinkProposals(opts: {
  from: string;
  to: string;
  categoryId?: string;
}): Promise<{ unlinked: UnlinkedExpense[]; proposals: LinkProposal[] }> {
  const costs = (await listFixedCosts()).filter(
    (c) => !opts.categoryId || c.categoryId === opts.categoryId
  );
  const occurrences = await getFixedCostSchedule(opts.from, opts.to, costs, {
    includeInactive: true,
  });
  const categoryIds = [...new Set(costs.map((c) => c.categoryId))];
  const unlinked = await listUnlinkedFixedExpenses({
    from: opts.from,
    to: opts.to,
    categoryIds,
  });
  return { unlinked, proposals: proposeOccurrenceLinks(unlinked, occurrences) };
}
