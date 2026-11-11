import { describe, expect, it } from 'vitest';
import type { BreakEvenDay } from './compute';
import { hasNoThreshold, toChartPoints } from './chart';

const day = (date: string, over: Partial<BreakEvenDay> = {}): BreakEvenDay => ({
  date,
  open: true,
  revenue: 1000,
  fixedCost: 500,
  breakEven: 800,
  remaining: 0,
  grossMargin: 600,
  result: 100,
  reached: true,
  shares: [{ id: 'x', label: 'Loyer', amount: 500 }],
  ...over,
});

describe('toChartPoints', () => {
  it('remet les jours en ordre chronologique et retire les parts', () => {
    const pts = toChartPoints([day('2026-11-03'), day('2026-11-01')]);
    expect(pts.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-03']);
    expect(pts[0]).toEqual({
      date: '2026-11-01',
      revenue: 1000,
      breakEven: 800,
      open: true,
    });
  });

  it('garde le jour fermé à 0 et un seuil inconnu à null', () => {
    const [closed, unknown] = toChartPoints([
      day('2026-11-02', { open: false, breakEven: 0 }),
      day('2026-11-03', { breakEven: null }),
    ]);
    expect(closed).toMatchObject({ open: false, breakEven: 0 });
    expect(unknown.breakEven).toBeNull();
  });
});

describe('hasNoThreshold', () => {
  it('vrai seulement si aucun seuil n’est calculable', () => {
    expect(hasNoThreshold(toChartPoints([day('a', { breakEven: null })]))).toBe(
      true
    );
    expect(
      hasNoThreshold(toChartPoints([day('a'), day('b', { breakEven: null })]))
    ).toBe(false);
    expect(hasNoThreshold([])).toBe(true);
  });
});
