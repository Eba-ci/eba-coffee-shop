import { describe, expect, it } from 'vitest';
import type { Occurrence } from './schedule';
import { buildWeeklyReminder } from './weekly-reminder';

const occ = (over: Partial<Occurrence>): Occurrence => ({
  costId: 'c1',
  label: 'Loyer',
  categoryId: 'cat',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  dueDate: '2026-11-12',
  amount: 100000,
  paid: 0,
  remaining: 100000,
  status: 'UPCOMING',
  overdue: false,
  expenseIds: [],
  ...over,
});

describe('buildWeeklyReminder', () => {
  it('borne la période lundi → dimanche', () => {
    const r = buildWeeklyReminder([], '2026-11-12');
    expect([r.from, r.to]).toEqual(['2026-11-09', '2026-11-15']);
  });

  it('totalise le restant, hors payé, trié par jour', () => {
    const r = buildWeeklyReminder(
      [
        occ({ costId: 'a', label: 'B', dueDate: '2026-11-14' }),
        occ({
          costId: 'b',
          label: 'A',
          dueDate: '2026-11-10',
          amount: 50000,
          remaining: 20000,
          paid: 30000,
          status: 'PARTIAL',
        }),
        occ({ costId: 'c', status: 'PAID', remaining: 0, paid: 100000 }),
      ],
      '2026-11-12'
    );
    expect(r.count).toBe(2);
    expect(r.remaining).toBe(120000);
    expect(r.items.map((o) => o.costId)).toEqual(['b', 'a']);
  });

  it('état vide sans erreur', () => {
    const r = buildWeeklyReminder([], '2026-11-12');
    expect(r).toMatchObject({ count: 0, remaining: 0, items: [] });
  });

  it('ne porte aucune donnée de salaire', () => {
    const r = buildWeeklyReminder([occ({})], '2026-11-12');
    expect(JSON.stringify(r)).not.toMatch(/salar|employ/i);
  });
});
