import { describe, expect, it } from 'vitest';
import { buildRateTimeline, ratePlacement } from './rate-timeline';

const rates = [
  { monthlyAmount: 100_000, startDate: '2026-11-01' },
  { monthlyAmount: 75_000, startDate: '2026-01-01' },
];

describe('buildRateTimeline', () => {
  it('ordonne du plus ancien au plus récent avec écart et période', () => {
    const t = buildRateTimeline(rates, null, '2026-11-15');
    expect(t.map((s) => s.monthlyAmount)).toEqual([75_000, 100_000]);
    expect(t[0]).toMatchObject({
      delta: null,
      deltaPct: null,
      endDate: '2026-10-31',
    });
    expect(t[1]).toMatchObject({
      delta: 25_000,
      deltaPct: 33,
      endDate: null,
      current: true,
    });
    expect(t[0].current).toBe(false);
  });

  it('un taux futur est « à venir », l’ancien reste en vigueur', () => {
    const t = buildRateTimeline(rates, null, '2026-06-01');
    expect(t[0].current).toBe(true);
    expect(t[1]).toMatchObject({ upcoming: true, current: false });
  });

  it('une baisse donne un écart négatif ; la sortie borne le dernier taux', () => {
    const t = buildRateTimeline(
      [
        { monthlyAmount: 100_000, startDate: '2026-01-01' },
        { monthlyAmount: 80_000, startDate: '2026-06-01' },
      ],
      '2026-08-31',
      '2026-11-15'
    );
    expect(t[1]).toMatchObject({
      delta: -20_000,
      deltaPct: -20,
      endDate: '2026-08-31',
      current: false,
    });
  });

  it('aucun taux : frise vide', () => {
    expect(buildRateTimeline([], null, '2026-11-15')).toEqual([]);
  });
});

describe('ratePlacement', () => {
  const existing = [{ startDate: '2026-01-01' }, { startDate: '2026-11-01' }];

  it('un ancien taux s’arrête la veille du taux suivant', () => {
    expect(
      ratePlacement(existing, '2025-06-01', '2025-01-01', '2026-11-15')
    ).toEqual({
      kind: 'past',
      endDate: '2025-12-31',
      beforeEmployment: false,
      duplicate: false,
    });
  });

  it('signale une date avant l’entrée et une date déjà prise', () => {
    expect(
      ratePlacement(existing, '2024-01-01', '2025-01-01', '2026-11-15')
        .beforeEmployment
    ).toBe(true);
    expect(
      ratePlacement(existing, '2026-01-01', '2025-01-01', '2026-11-15')
        .duplicate
    ).toBe(true);
  });

  it('sans taux postérieur : période ouverte', () => {
    expect(
      ratePlacement([], '2026-03-01', '2026-01-01', '2026-11-15').endDate
    ).toBeNull();
  });
});

describe('buildRateTimeline : fin saisie', () => {
  it('la fin explicite prime sur la veille du taux suivant (trou possible)', () => {
    const t = buildRateTimeline(
      [
        {
          monthlyAmount: 75_000,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
        },
        { monthlyAmount: 100_000, startDate: '2026-06-01' },
      ],
      null,
      '2026-11-15'
    );
    expect(t[0].endDate).toBe('2026-03-31');
    expect(t[0].current).toBe(false);
    expect(t[1].current).toBe(true);
  });
});
