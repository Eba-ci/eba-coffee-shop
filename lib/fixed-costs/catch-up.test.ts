import { describe, expect, it } from 'vitest';
import type { BreakEvenDay } from './compute';
import { applyCatchUp } from './catch-up';

const day = (date: string, revenue: number, over: Partial<BreakEvenDay> = {}) =>
  ({
    date,
    open: true,
    revenue,
    fixedCost: 0,
    salaryCost: 0,
    breakEven: 1000,
    catchUp: 0,
    target: 1000,
    remaining: Math.max(0, 1000 - revenue),
    grossMargin: null,
    result: null,
    reached: revenue >= 1000,
    shares: [],
    ...over,
  }) as BreakEvenDay;

/** 5 jours ouvrés d'un mois, seuil de base 1000. */
const month = (revenues: number[]) =>
  revenues.map((r, i) => day(`2026-11-0${i + 1}`, r));

describe('applyCatchUp', () => {
  it('reporte le manque d’un jour échu sur les jours restants, à parts égales', () => {
    // J1 : 600 sur 1000 → manque 400, réparti sur 4 jours (100 chacun).
    const out = applyCatchUp(month([600, 0, 0, 0, 0]), '2026-11-02');
    expect(out[0].catchUp).toBe(0);
    expect(out.slice(1).map((d) => d.target)).toEqual([1100, 1100, 1100, 1100]);
    expect(out[1].catchUp).toBe(100);
  });

  it('le retard se cumule jour après jour', () => {
    // J1 manque 400 ; J2 (objectif 1100) fait 600 → retard 800, 3 jours : ~267.
    const out = applyCatchUp(month([600, 600, 0, 0, 0]), '2026-11-03');
    expect(out[2].catchUp).toBe(Math.round(800 / 3));
    expect(out[2].target).toBe(1000 + Math.round(800 / 3));
  });

  it('un jour au-dessus de l’objectif rembourse du retard, sans crédit au-delà de zéro', () => {
    const out = applyCatchUp(month([600, 5000, 0, 0, 0]), '2026-11-03');
    expect(out[2].catchUp).toBe(0);
    expect(out[2].target).toBe(1000);
  });

  it('aujourd’hui n’est pas figé : son manque n’est pas reporté', () => {
    const out = applyCatchUp(month([600, 100, 0, 0, 0]), '2026-11-02');
    // Aujourd’hui (J2) ne charge pas le retard de J2 lui-même.
    expect(out[2].catchUp).toBe(out[1].catchUp);
    expect(out[1].reached).toBe(false);
  });

  it('le dernier jour ouvré solde tout le retard', () => {
    const out = applyCatchUp(month([0, 0, 0, 0, 0]), '2026-11-05');
    expect(out[4].catchUp).toBeGreaterThan(0);
    expect(out[4].catchUp).toBe(Math.round(4000 / 1));
  });

  it('ignore les jours fermés et à marge inconnue', () => {
    const days = [
      day('2026-11-01', 0),
      day('2026-11-02', 0, { open: false, breakEven: 0, target: 0 }),
      day('2026-11-03', 0, { breakEven: null, target: null }),
      day('2026-11-04', 0),
    ];
    const out = applyCatchUp(days, '2026-11-04');
    expect(out[1].target).toBe(0);
    expect(out[2].target).toBeNull();
    expect(out[3].catchUp).toBe(1000);
  });

  it('le retard repart à zéro chaque mois', () => {
    const out = applyCatchUp(
      [day('2026-11-30', 0), day('2026-12-01', 0), day('2026-12-02', 0)],
      '2026-12-02'
    );
    expect(out[1].catchUp).toBe(0);
  });
});
