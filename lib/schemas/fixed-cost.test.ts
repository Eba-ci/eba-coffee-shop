import { describe, expect, it } from 'vitest';
import { fixedCostInputSchema, fixedCostUpdateSchema } from './fixed-cost';

describe('fixedCost schemas', () => {
  it('une mise à jour partielle ne touche pas la périodicité', () => {
    expect(fixedCostUpdateSchema.parse({ active: false })).toEqual({
      active: false,
    });
  });

  it('la création retombe sur MONTHLY', () => {
    const v = fixedCostInputSchema.parse({
      label: 'Loyer',
      amount: 1000,
      startDate: '2026-11-01',
      categoryId: 'c',
    });
    expect(v.periodicity).toBe('MONTHLY');
  });

  it('refuse une fin avant la prise d’effet', () => {
    expect(
      fixedCostInputSchema.safeParse({
        label: 'x',
        amount: 1,
        startDate: '2026-11-10',
        endDate: '2026-11-01',
        categoryId: 'c',
      }).success
    ).toBe(false);
  });
});
