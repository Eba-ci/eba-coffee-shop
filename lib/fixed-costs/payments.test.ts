import { describe, expect, it } from 'vitest';
import type { Occurrence } from './schedule';
import {
  buildPaymentGrid,
  dominantStatus,
  groupByDueDate,
  remainingTotal,
  summarizeOccurrences,
  unpaid,
  weekBounds,
} from './payments';

const occ = (over: Partial<Occurrence> = {}): Occurrence => ({
  costId: 'c1',
  label: 'Loyer',
  categoryId: 'cat',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  dueDate: '2026-11-05',
  amount: 300000,
  paid: 0,
  remaining: 300000,
  status: 'LATE',
  expenseIds: [],
  ...over,
});

describe('weekBounds', () => {
  it('rend la semaine du lundi au dimanche', () => {
    // 2026-11-11 est un mercredi
    expect(weekBounds('2026-11-11')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
  });
  it('un dimanche appartient à la semaine qui commence le lundi précédent', () => {
    expect(weekBounds('2026-11-15')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
  });
  it('un lundi reste en tête de sa propre semaine', () => {
    expect(weekBounds('2026-11-09')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
  });
});

describe('buildPaymentGrid', () => {
  it('commence un lundi et se termine un dimanche', () => {
    const weeks = buildPaymentGrid('2026-11');
    // 1er novembre 2026 = dimanche → première semaine à 6 blancs + le 1er
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][6]).toEqual({ date: '2026-11-01' });
    const last = weeks[weeks.length - 1];
    const filled = last.filter((c): c is { date: string } => c !== null);
    expect(filled[filled.length - 1]).toEqual({ date: '2026-11-30' });
    // chaque semaine fait 7 cases
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it('couvre tous les jours du mois sans trou', () => {
    const dates = buildPaymentGrid('2026-02')
      .flat()
      .filter((c): c is { date: string } => c !== null)
      .map((c) => c.date);
    expect(dates[0]).toBe('2026-02-01');
    expect(dates[dates.length - 1]).toBe('2026-02-28');
    expect(new Set(dates).size).toBe(28);
  });
});

describe('groupByDueDate', () => {
  it('regroupe par jour et garde l’ordre d’arrivée', () => {
    const map = groupByDueDate([
      occ({ label: 'A', dueDate: '2026-11-05' }),
      occ({ label: 'B', dueDate: '2026-11-05' }),
      occ({ label: 'C', dueDate: '2026-11-20' }),
    ]);
    expect(map.get('2026-11-05')?.map((o) => o.label)).toEqual(['A', 'B']);
    expect(map.get('2026-11-20')?.map((o) => o.label)).toEqual(['C']);
  });
});

describe('unpaid / remainingTotal', () => {
  it('écarte les échéances payées', () => {
    const list = [
      occ({ status: 'PAID', paid: 300000, remaining: 0 }),
      occ({ status: 'LATE' }),
      occ({ status: 'PARTIAL', paid: 100000, remaining: 200000 }),
    ];
    expect(unpaid(list).map((o) => o.status)).toEqual(['LATE', 'PARTIAL']);
    expect(remainingTotal(list)).toBe(500000);
  });
});

describe('dominantStatus', () => {
  it('privilégie le statut le plus urgent', () => {
    expect(dominantStatus([])).toBeNull();
    expect(dominantStatus([occ({ status: 'PAID' })])).toBe('PAID');
    expect(
      dominantStatus([
        occ({ status: 'PAID' }),
        occ({ status: 'PARTIAL' }),
        occ({ status: 'LATE' }),
      ])
    ).toBe('LATE');
    expect(
      dominantStatus([occ({ status: 'UPCOMING' }), occ({ status: 'PARTIAL' })])
    ).toBe('PARTIAL');
  });
});

describe('summarizeOccurrences', () => {
  it('cumule montants dus, payés et restants et compte par statut', () => {
    const s = summarizeOccurrences([
      occ({ status: 'PAID', paid: 300000, remaining: 0 }),
      occ({ status: 'PARTIAL', paid: 100000, remaining: 200000 }),
      occ({ status: 'LATE' }),
      occ({ status: 'UPCOMING', amount: 50000, remaining: 50000 }),
    ]);
    expect(s.count).toBe(4);
    expect(s.due).toBe(950000);
    expect(s.paid).toBe(400000);
    expect(s.remaining).toBe(550000);
    expect(s.paidCount).toBe(1);
    expect(s.partialCount).toBe(1);
    expect(s.lateCount).toBe(1);
    expect(s.upcomingCount).toBe(1);
  });
});
