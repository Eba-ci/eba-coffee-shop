import { describe, expect, it } from 'vitest';
import { marginRateFromExpenses } from './expense-margin';

describe('marginRateFromExpenses', () => {
  it('= (CA − dépenses variables) ÷ CA', () => {
    expect(marginRateFromExpenses(1_000_000, 400_000)).toBeCloseTo(0.6);
  });
  it('null sans CA', () => {
    expect(marginRateFromExpenses(0, 100)).toBeNull();
  });
  it('null sans dépense variable (100 % serait trompeur)', () => {
    expect(marginRateFromExpenses(500_000, 0)).toBeNull();
  });
  it('null quand les dépenses dépassent le CA', () => {
    expect(marginRateFromExpenses(100_000, 150_000)).toBeNull();
    expect(marginRateFromExpenses(100_000, 100_000)).toBeNull();
  });
});
