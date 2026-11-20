import { describe, expect, it } from 'vitest';
import { groupOccurrencesByMonth, monthTitle } from './group';
import type { Occurrence } from './schedule';

const occ = (dueDate: string, remaining: number, costId = 'c'): Occurrence =>
  ({
    costId,
    label: 'x',
    categoryId: 'k',
    periodStart: dueDate,
    periodEnd: dueDate,
    dueDate,
    amount: 100000,
    paid: 100000 - remaining,
    remaining,
    status: remaining < 100000 ? 'PARTIAL' : 'LATE',
    overdue: true,
    expenseIds: [],
  }) as Occurrence;

describe('groupOccurrencesByMonth', () => {
  const list = [
    occ('2026-09-10', 100000, 'a'),
    occ('2026-11-02', 100000, 'b'),
    occ('2026-10-20', 40000, 'c'), // partielle
    occ('2026-11-01', 100000, 'd'),
    occ('2026-10-05', 100000, 'e'),
  ];
  const groups = groupOccurrencesByMonth(list);

  it('un groupe par mois, du plus récent au plus ancien', () => {
    expect(groups.map((g) => g.month)).toEqual([
      '2026-11',
      '2026-10',
      '2026-09',
    ]);
  });
  it('compte et montant restant par mois (partielle comprise)', () => {
    expect(groups.map((g) => [g.count, g.remaining])).toEqual([
      [2, 200000],
      [2, 140000],
      [1, 100000],
    ]);
  });
  it('le total des groupes égale celui de la liste plate', () => {
    const flat = list.reduce((s, o) => s + o.remaining, 0);
    expect(groups.reduce((s, g) => s + g.remaining, 0)).toBe(flat);
  });
  it('trie par jour dans un mois, liste vide = aucun groupe', () => {
    expect(groups[0].occurrences.map((o) => o.costId)).toEqual(['d', 'b']);
    expect(groupOccurrencesByMonth([])).toEqual([]);
  });
  it('titre en clair', () => {
    expect(monthTitle('2026-11')).toBe('novembre 2026');
  });
});
