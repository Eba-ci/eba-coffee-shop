import { describe, expect, it } from 'vitest';
import { buildHistoryGrid, monthRange } from './history-grid';
import { occurrencesInRange, type ScheduledCost } from './schedule';

const TODAY = '2026-11-15';
const CURRENT = '2026-11';

const cost = (over: Partial<ScheduledCost> = {}): ScheduledCost => ({
  id: 'c1',
  label: 'Loyer',
  amount: 100_000,
  periodicity: 'MONTHLY',
  startDate: '2026-01-05',
  endDate: null,
  active: true,
  categoryId: 'cat',
  installments: [],
  ...over,
});
const meta = (c: ScheduledCost) => ({
  id: c.id,
  label: c.label,
  inactive: !c.active,
  startDate: c.startDate,
  endDate: c.endDate,
});
const pay = (costId: string, dueDate: string, amount: number) => ({
  expenseId: `${costId}${dueDate}`,
  fixedCostId: costId,
  dueDate,
  amount,
});
const grid = (
  costs: ScheduledCost[],
  payments: ReturnType<typeof pay>[],
  months: string[],
  opts = {}
) =>
  buildHistoryGrid(
    costs.map(meta),
    costs.flatMap((c) =>
      occurrencesInRange(
        c,
        `${months[0]}-01`,
        `${months.at(-1)}-31`,
        payments,
        TODAY
      )
    ),
    months,
    CURRENT,
    opts
  );

describe('monthRange', () => {
  it('donne 12 mois croissants finissant au mois demandé', () => {
    const r = monthRange('2026-11', 12);
    expect(r).toHaveLength(12);
    expect(r[0]).toBe('2025-12');
    expect(r.at(-1)).toBe('2026-11');
  });
});

describe('buildHistoryGrid', () => {
  const months = ['2026-03', '2026-04', '2026-05'];

  it('un loyer payé en mars, rien en avril, payé en mai : avril est en retard et retenu par le filtre', () => {
    const payments = [
      pay('c1', '2026-03-05', 100_000),
      pay('c1', '2026-05-05', 100_000),
    ];
    const g = grid([cost()], payments, months, { onlyUnpaid: true });
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0].cells.map((c) => c.state)).toEqual([
      'PAID',
      'LATE',
      'PAID',
    ]);
    expect(g.rows[0].lateMonths).toBe(1);
  });

  it('le compteur correspond au nombre de cases en retard', () => {
    const g = grid([cost()], [], months);
    const r = g.rows[0];
    expect(r.lateMonths).toBe(r.cells.filter((c) => c.state === 'LATE').length);
    expect(r.lateMonths).toBe(3);
    expect(r.unpaidMonths).toBe(0);
  });

  it('une charge créée en mai : janvier à avril sont non applicables', () => {
    const g = grid(
      [cost({ startDate: '2026-05-05' })],
      [],
      ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
    );
    expect(g.rows[0].cells.map((c) => c.state)).toEqual([
      'NA',
      'NA',
      'NA',
      'NA',
      'LATE',
    ]);
  });

  it('une charge trimestrielle n’a pas de retard sur les mois sans échéance', () => {
    const g = grid(
      [cost({ periodicity: 'QUARTERLY', startDate: '2026-01-05' })],
      [],
      ['2026-01', '2026-02', '2026-03', '2026-04']
    );
    expect(g.rows[0].cells.map((c) => c.state)).toEqual([
      'LATE',
      'NA',
      'NA',
      'LATE',
    ]);
  });

  it('un mois passé partiellement réglé est en retard, pas partiel', () => {
    const g = grid([cost()], [pay('c1', '2026-03-05', 40_000)], months);
    expect(g.rows[0].cells[0]).toMatchObject({
      state: 'LATE',
      remaining: 60_000,
    });
  });

  it('le mois courant n’est jamais en retard : impayé (échu) ou à venir', () => {
    const late = grid([cost({ startDate: '2026-11-05' })], [], ['2026-11']);
    expect(late.rows[0].cells[0].state).toBe('UNPAID');
    expect(late.rows[0].lateMonths).toBe(0);
    expect(late.rows[0].unpaidMonths).toBe(1);
    const upcoming = grid([cost({ startDate: '2026-11-25' })], [], ['2026-11']);
    expect(upcoming.rows[0].cells[0].state).toBe('UPCOMING');
  });

  it('partiel (mois courant) avec reste exact, et totaux = somme des colonnes', () => {
    const payments = [pay('c1', '2026-11-05', 40_000)];
    const g = grid(
      [cost(), cost({ id: 'c2', label: 'Internet', amount: 20_000 })],
      payments,
      ['2026-11', '2026-12', '2027-01']
    );
    expect(g.rows[0].cells[0]).toMatchObject({
      state: 'PARTIAL',
      paid: 40_000,
      remaining: 60_000,
    });
    const sum = (k: 'due' | 'paid' | 'remaining') =>
      g.columns.reduce((s, c) => s + c[k], 0);
    expect(g.total.due).toBe(sum('due'));
    expect(g.total.paid).toBe(sum('paid'));
    expect(g.total.remaining).toBe(sum('remaining'));
    expect(g.total.due).toBe(3 * 100_000 + 3 * 20_000);
  });

  it('une charge terminée n’est pas applicable après sa fin', () => {
    const g = grid([cost({ endDate: '2026-03-31' })], [], months);
    expect(g.rows[0].cells.map((c) => c.state)).toEqual(['LATE', 'NA', 'NA']);
  });
});
