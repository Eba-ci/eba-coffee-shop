// lib/fixed-costs/history-grid.ts
//
// Grille PURE charge × mois (#454) : « quels mois n'ont reçu aucun paiement ? ».
// Réutilise les occurrences et statuts de `schedule.ts` : aucun nouveau calcul
// de statut, rien n'est stocké. Aucune donnée de salaire : la grille ne reçoit
// que des charges fixes (la masse salariale reste un nombre ailleurs).
//
// Décisions (épique #461) : un mois est IMPAYÉ s'il porte une échéance, que rien
// n'y est versé (`paid === 0`) et qu'il est STRICTEMENT passé. Le mois courant
// n'est jamais impayé : il est « en retard » (date passée) ou « à venir ».

import { shiftMonth } from './month';
import type { Occurrence } from './schedule';

export type HistoryCellState =
  | 'NA' // pas d'échéance ce mois-là (pas en vigueur, terminée, autre périodicité)
  | 'PAID'
  | 'PARTIAL'
  | 'UNPAID' // mois passé, échéance existante, rien versé
  | 'LATE' // mois courant, date d'échéance passée, rien versé
  | 'UPCOMING';

export type HistoryCell = {
  month: string;
  state: HistoryCellState;
  due: number;
  paid: number;
  remaining: number;
};

export type HistoryGridCost = {
  id: string;
  label: string;
  /** Charge désactivée : visible sur sa période d'activité, grisée. */
  inactive: boolean;
  startDate: string;
  endDate: string | null;
};

export type HistoryRow = {
  cost: HistoryGridCost;
  cells: HistoryCell[];
  unpaidMonths: number;
  due: number;
  paid: number;
  remaining: number;
};

export type HistoryGrid = {
  months: string[];
  rows: HistoryRow[];
  /** Totaux par colonne (même ordre que `months`). */
  columns: { month: string; due: number; paid: number; remaining: number }[];
  total: { due: number; paid: number; remaining: number };
};

/** `count` mois consécutifs se terminant à `endMonth` (inclus), croissants. */
export function monthRange(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    shiftMonth(endMonth, i - (count - 1))
  );
}

function cellFor(
  month: string,
  occurrences: readonly Occurrence[],
  currentMonth: string
): HistoryCell {
  if (occurrences.length === 0)
    return { month, state: 'NA', due: 0, paid: 0, remaining: 0 };
  const due = occurrences.reduce((s, o) => s + o.amount, 0);
  const paid = occurrences.reduce((s, o) => s + o.paid, 0);
  const remaining = occurrences.reduce((s, o) => s + o.remaining, 0);
  let state: HistoryCellState;
  if (remaining === 0) state = 'PAID';
  else if (paid > 0) state = 'PARTIAL';
  else if (month < currentMonth) state = 'UNPAID';
  else if (occurrences.some((o) => o.overdue)) state = 'LATE';
  else state = 'UPCOMING';
  return { month, state, due, paid, remaining };
}

/**
 * `occurrences` doit couvrir tous les mois de la plage (une seule lecture).
 * `onlyUnpaid` ne garde que les charges ayant au moins un mois IMPAYÉ ; les
 * totaux sont alors ceux des lignes conservées.
 */
export function buildHistoryGrid(
  costs: readonly HistoryGridCost[],
  occurrences: readonly Occurrence[],
  months: readonly string[],
  currentMonth: string,
  opts: { onlyUnpaid?: boolean } = {}
): HistoryGrid {
  const byCostMonth = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const key = `${o.costId}|${o.dueDate.slice(0, 7)}`;
    const list = byCostMonth.get(key) ?? [];
    list.push(o);
    byCostMonth.set(key, list);
  }

  let rows: HistoryRow[] = costs.map((cost) => {
    const cells = months.map((m) =>
      cellFor(m, byCostMonth.get(`${cost.id}|${m}`) ?? [], currentMonth)
    );
    return {
      cost,
      cells,
      unpaidMonths: cells.filter((c) => c.state === 'UNPAID').length,
      due: cells.reduce((s, c) => s + c.due, 0),
      paid: cells.reduce((s, c) => s + c.paid, 0),
      remaining: cells.reduce((s, c) => s + c.remaining, 0),
    };
  });
  if (opts.onlyUnpaid) rows = rows.filter((r) => r.unpaidMonths > 0);

  const columns = months.map((month, i) => ({
    month,
    due: rows.reduce((s, r) => s + r.cells[i].due, 0),
    paid: rows.reduce((s, r) => s + r.cells[i].paid, 0),
    remaining: rows.reduce((s, r) => s + r.cells[i].remaining, 0),
  }));
  return {
    months: [...months],
    rows,
    columns,
    total: {
      due: rows.reduce((s, r) => s + r.due, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      remaining: rows.reduce((s, r) => s + r.remaining, 0),
    },
  };
}
