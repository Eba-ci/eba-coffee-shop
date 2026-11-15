import { describe, expect, it } from 'vitest';
import {
  allocateOldestFirst,
  proposeInstalments,
} from '@/lib/salaries/installments';

const sum = (l: { amount: number }[]) => l.reduce((a, i) => a + i.amount, 0);

describe('proposeInstalments', () => {
  it('répartit 100 000 sur 3 mois, reste aux premiers', () => {
    const r = proposeInstalments(100000, 3, '2026-11');
    expect(r.map((i) => i.amount)).toEqual([33334, 33333, 33333]);
    expect(r.map((i) => i.month)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
  it('somme exacte pour tous les N', () => {
    for (let n = 1; n <= 36; n++) {
      expect(sum(proposeInstalments(123457, n, '2026-01'))).toBe(123457);
    }
  });
  it('refuse N hors bornes et mois invalide', () => {
    expect(proposeInstalments(1000, 0, '2026-11')).toEqual([]);
    expect(proposeInstalments(1000, 37, '2026-11')).toEqual([]);
    expect(proposeInstalments(1000, 2.5, '2026-11')).toEqual([]);
    expect(proposeInstalments(1000, 3, '2026-13')).toEqual([]);
  });
  it('arriéré 0 : aucune proposition', () => {
    expect(proposeInstalments(0, 3, '2026-11')).toEqual([]);
  });
});

describe('allocateOldestFirst', () => {
  const months = [
    { month: '2026-10', remaining: 30000 },
    { month: '2026-08', remaining: 20000 },
  ];
  it('remplit le plus ancien d’abord, plafonné au reste', () => {
    expect(allocateOldestFirst(35000, months)).toEqual({
      '2026-08': 20000,
      '2026-10': 15000,
    });
  });
  it('ne dépasse jamais le total des restes', () => {
    expect(allocateOldestFirst(99999, months)).toEqual({
      '2026-08': 20000,
      '2026-10': 30000,
    });
  });
});
