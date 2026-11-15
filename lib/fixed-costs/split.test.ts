import { describe, expect, it } from 'vitest';
import { installmentsError } from './installments';
import { maxSplitCount, splitAmount, splitInstallments } from './split';

describe('splitAmount', () => {
  it.each([1, 2, 3, 4, 7])('somme exacte pour %i échéances', (n) => {
    for (const total of [60000, 100000, 100, 59999, 1]) {
      const parts = splitAmount(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((s, p) => s + p, 0)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    }
  });
  it('donne les francs restants aux premières échéances', () => {
    expect(splitAmount(10, 3)).toEqual([4, 3, 3]);
  });
  it('60 000 F en 4 = 4 × 15 000 F', () => {
    expect(splitAmount(60000, 4)).toEqual([15000, 15000, 15000, 15000]);
  });
});

describe('splitInstallments', () => {
  it('une répartition proposée est toujours valide pour le serveur', () => {
    for (const p of ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const) {
      for (let n = 1; n <= maxSplitCount(p); n++) {
        for (const startDay of [1, 15, 31]) {
          const inst = splitInstallments(p, 60001, n, startDay);
          expect(inst).toHaveLength(n);
          expect(installmentsError(p, 60001, inst)).toBeNull();
        }
      }
    }
  });
  it('mensuel : 4 échéances à une semaine d’écart', () => {
    const days = splitInstallments('MONTHLY', 60000, 4, 1).map((i) => i.day);
    expect(days).toEqual([1, 8, 15, 22]);
  });
  it('refuse hors bornes et charge journalière', () => {
    expect(splitInstallments('DAILY', 100, 2, 1)).toEqual([]);
    expect(splitInstallments('WEEKLY', 100, 8, 1)).toEqual([]);
  });
});

describe('message d’écart', () => {
  const inst = (a: number[]) =>
    a.map((amount, i) => ({ monthOffset: 0, day: i + 1, amount }));
  it('dit ce qu’il manque', () => {
    expect(installmentsError('MONTHLY', 60000, inst([55000]))).toContain(
      'il manque 5 000 F'
    );
  });
  it('dit l’excédent', () => {
    expect(installmentsError('MONTHLY', 60000, inst([65000]))).toContain(
      'excédent de 5 000 F'
    );
  });
});
