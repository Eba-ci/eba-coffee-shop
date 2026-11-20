import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: { expense: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock('@/lib/timezone', async (orig) => ({
  ...(await orig<typeof import('@/lib/timezone')>()),
  todayDateString: () => '2026-11-15',
}));

import { getFixedCostSchedule, type FixedCostRow } from './payments-queries';

const inactive = {
  id: 'c1',
  label: 'Loyer',
  amount: 100_000,
  periodicity: 'MONTHLY',
  startDate: '2026-01-05',
  endDate: '2026-03-31',
  active: false,
  categoryId: 'cat',
  categoryName: 'Loyer',
  note: null,
  sortOrder: 0,
  installments: [],
} as unknown as FixedCostRow;

describe('getFixedCostSchedule et charge désactivée', () => {
  it('l’ignore par défaut (autres lecteurs inchangés)', async () => {
    expect(
      await getFixedCostSchedule('2026-01-01', '2026-06-30', [inactive])
    ).toEqual([]);
  });

  it('l’inclut sur sa fenêtre début → fin avec includeInactive', async () => {
    const r = await getFixedCostSchedule(
      '2026-01-01',
      '2026-06-30',
      [inactive],
      { includeInactive: true }
    );
    expect(r.map((o) => o.dueDate)).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
    ]);
  });
});
