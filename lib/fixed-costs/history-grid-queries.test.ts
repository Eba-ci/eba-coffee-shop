import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pq } = vi.hoisted(() => ({
  pq: { listFixedCosts: vi.fn(), listLinkedPayments: vi.fn() },
}));
vi.mock('./payments-queries', () => pq);
vi.mock('@/lib/timezone', async (orig) => ({
  ...(await orig<typeof import('@/lib/timezone')>()),
  todayDateString: () => '2026-11-15',
}));

import { getFixedCostHistoryGrid } from './history-grid-queries';

const cost = (over = {}) => ({
  id: 'c1',
  label: 'Loyer',
  amount: 100_000,
  periodicity: 'MONTHLY',
  startDate: '2026-01-05',
  endDate: null,
  active: true,
  categoryId: 'cat',
  categoryName: 'Loyer',
  note: null,
  sortOrder: 0,
  installments: [],
  ...over,
});

describe('getFixedCostHistoryGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pq.listLinkedPayments.mockResolvedValue([]);
  });

  it('lit toute la plage en une seule fois (charges + dépenses liées)', async () => {
    pq.listFixedCosts.mockResolvedValue([
      cost(),
      cost({ id: 'c2', label: 'Internet' }),
    ]);
    const g = await getFixedCostHistoryGrid({});
    expect(g.months).toHaveLength(12);
    expect(pq.listFixedCosts).toHaveBeenCalledTimes(1);
    expect(pq.listLinkedPayments).toHaveBeenCalledTimes(1);
  });

  it('garde une charge inactive mais exclut salaires et charges par jour ouvré', async () => {
    pq.listFixedCosts.mockResolvedValue([
      cost({ active: false }),
      cost({ id: 's', label: 'Salaires', categoryName: 'Salaires' }),
      cost({ id: 'd', periodicity: 'DAILY' }),
    ]);
    const g = await getFixedCostHistoryGrid({});
    expect(g.rows.map((r) => r.cost.id)).toEqual(['c1']);
    expect(g.rows[0].cost.inactive).toBe(true);
    expect(g.rows[0].cells.some((c) => c.state !== 'NA')).toBe(true);
  });

  it('borne la plage aux choix 6 / 12 / 24', async () => {
    pq.listFixedCosts.mockResolvedValue([]);
    expect((await getFixedCostHistoryGrid({ months: 6 })).months).toHaveLength(
      6
    );
    expect((await getFixedCostHistoryGrid({ months: 99 })).months).toHaveLength(
      12
    );
  });
});
