import { describe, expect, it } from 'vitest';
import {
  buildSalaryMigrationPlan,
  isSalaryFixedCost,
  normalizeText,
  type SalaryFixedCostCandidate,
} from './salary-migration';

const cost = (
  over: Partial<SalaryFixedCostCandidate> = {}
): SalaryFixedCostCandidate => ({
  id: 'fc1',
  label: 'Loyer',
  amount: 100_000,
  periodicity: 'MONTHLY',
  categoryName: 'Loyer',
  startDate: '2026-01-01',
  endDate: null,
  active: true,
  ...over,
});

describe('normalizeText', () => {
  it('replie casse et accents', () => {
    expect(normalizeText('  Salarié  ')).toBe('salarie');
    expect(normalizeText('SALAIRES')).toBe('salaires');
  });
});

describe('isSalaryFixedCost', () => {
  it('reconnaît la catégorie « Salaires » (accents/casse ignorés)', () => {
    expect(isSalaryFixedCost(cost({ categoryName: 'Salaires' }))).toBe(true);
    expect(isSalaryFixedCost(cost({ categoryName: '  SALAIRES ' }))).toBe(true);
  });

  it('reconnaît un libellé contenant « salaire »', () => {
    expect(isSalaryFixedCost(cost({ label: 'Salaires employés' }))).toBe(true);
    expect(isSalaryFixedCost(cost({ label: 'SALAIRE serveur' }))).toBe(true);
    expect(isSalaryFixedCost(cost({ label: 'Total salarial' }))).toBe(false);
  });

  it('ignore les charges qui ne sont pas des salaires', () => {
    expect(isSalaryFixedCost(cost())).toBe(false);
    expect(
      isSalaryFixedCost(cost({ label: 'Loyer', categoryName: 'Loyer' }))
    ).toBe(false);
  });
});

describe('buildSalaryMigrationPlan', () => {
  it('liste, trie et somme les charges concernées', () => {
    const plan = buildSalaryMigrationPlan([
      cost({ id: 'b', label: 'Salaires serveurs', amount: 70_000 }),
      cost({ id: 'a', label: 'Loyer', amount: 200_000 }),
      cost({
        id: 'c',
        label: 'Paie équipe',
        amount: 30_000,
        categoryName: 'Salaires',
      }),
    ]);
    expect(plan.empty).toBe(false);
    expect(plan.candidates.map((c) => c.id)).toEqual(['c', 'b']);
    expect(plan.totalAmount).toBe(100_000);
  });

  it('plan vide quand rien ne reste (idempotence)', () => {
    const plan = buildSalaryMigrationPlan([
      cost({ id: 'a', label: 'Loyer', categoryName: 'Loyer' }),
    ]);
    expect(plan.empty).toBe(true);
    expect(plan.candidates).toEqual([]);
    expect(plan.totalAmount).toBe(0);
  });
});
