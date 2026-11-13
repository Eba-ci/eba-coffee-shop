import { describe, expect, it } from 'vitest';
import {
  buildSalaryMigrationPlan,
  buildSalaryRestorePlan,
  isSalaryFixedCost,
  isSalaryNamed,
  normalizeText,
  type SalaryFixedCostRecord,
} from './salary-migration';

const rec = (
  over: Partial<SalaryFixedCostRecord> = {}
): SalaryFixedCostRecord => ({
  id: 'fc1',
  label: 'Loyer',
  amount: 100_000,
  periodicity: 'MONTHLY',
  startDate: '2026-01-01',
  endDate: null,
  categoryId: 'cat1',
  categoryName: 'Loyer',
  active: true,
  note: null,
  sortOrder: 0,
  installments: [],
  ...over,
});

describe('normalizeText', () => {
  it('replie casse et accents', () => {
    expect(normalizeText('  Salarié  ')).toBe('salarie');
    expect(normalizeText('SALAIRES')).toBe('salaires');
  });
});

describe('isSalaryNamed', () => {
  it('reconnaît la catégorie « Salaires » (accents/casse ignorés)', () => {
    expect(isSalaryNamed({ label: 'X', categoryName: 'Salaires' })).toBe(true);
    expect(isSalaryNamed({ label: 'X', categoryName: '  SALAIRES ' })).toBe(
      true
    );
  });

  it('reconnaît un libellé contenant « salaire »', () => {
    expect(
      isSalaryNamed({ label: 'Salaires employés', categoryName: 'X' })
    ).toBe(true);
    expect(isSalaryNamed({ label: 'SALAIRE serveur', categoryName: 'X' })).toBe(
      true
    );
    expect(isSalaryNamed({ label: 'Total salarial', categoryName: 'X' })).toBe(
      false
    );
    expect(isSalaryNamed({ label: 'Loyer', categoryName: 'Loyer' })).toBe(
      false
    );
  });
});

describe('isSalaryFixedCost', () => {
  it('reconnaît ses propres champs', () => {
    expect(isSalaryFixedCost(rec({ categoryName: 'Salaires' }))).toBe(true);
    expect(isSalaryFixedCost(rec({ label: 'Salaires serveurs' }))).toBe(true);
    expect(isSalaryFixedCost(rec())).toBe(false);
  });
});

describe('buildSalaryMigrationPlan', () => {
  it('liste, trie les charges et regroupe les montants par périodicité', () => {
    const plan = buildSalaryMigrationPlan([
      rec({
        id: 'b',
        label: 'Salaires serveurs',
        amount: 70_000,
        periodicity: 'MONTHLY',
      }),
      rec({ id: 'a', label: 'Loyer', amount: 200_000 }),
      rec({
        id: 'c',
        label: 'Paie équipe',
        amount: 30_000,
        categoryName: 'Salaires',
        periodicity: 'WEEKLY',
      }),
    ]);
    expect(plan.empty).toBe(false);
    expect(plan.candidates.map((c) => c.id)).toEqual(['c', 'b']);
    expect(plan.totalAmount).toBe(100_000);
    expect(plan.totalsByPeriodicity).toEqual([
      { periodicity: 'WEEKLY', total: 30_000, count: 1 },
      { periodicity: 'MONTHLY', total: 70_000, count: 1 },
    ]);
  });

  it('plan vide quand rien ne reste (idempotence)', () => {
    const plan = buildSalaryMigrationPlan([
      rec({ id: 'a', label: 'Loyer', categoryName: 'Loyer' }),
    ]);
    expect(plan.empty).toBe(true);
    expect(plan.candidates).toEqual([]);
    expect(plan.totalAmount).toBe(0);
    expect(plan.totalsByPeriodicity).toEqual([]);
  });
});

describe('buildSalaryRestorePlan — aller-retour de sauvegarde', () => {
  const records = [
    rec({ id: 'fc1', label: 'Salaires A', categoryName: 'Salaires' }),
    rec({
      id: 'fc2',
      label: 'Salaires B',
      categoryName: 'Salaires',
      installments: [{ monthOffset: 0, day: 5, amount: 50_000 }],
    }),
  ];

  it('recrée tout depuis une sauvegarde JSON', () => {
    const parsed = JSON.parse(JSON.stringify({ charges: records })) as {
      charges: SalaryFixedCostRecord[];
    };
    const plan = buildSalaryRestorePlan(parsed.charges, new Set());
    expect(plan.toCreate.map((c) => c.id)).toEqual(['fc1', 'fc2']);
    expect(plan.toCreate[1].installments).toEqual([
      { monthOffset: 0, day: 5, amount: 50_000 },
    ]);
    expect(plan.empty).toBe(false);
  });

  it('ne recrée pas ce qui existe déjà (idempotence par id)', () => {
    const plan = buildSalaryRestorePlan(records, new Set(['fc1']));
    expect(plan.toCreate.map((c) => c.id)).toEqual(['fc2']);
    expect(plan.alreadyPresent.map((c) => c.id)).toEqual(['fc1']);
    const again = buildSalaryRestorePlan(records, new Set(['fc1', 'fc2']));
    expect(again.empty).toBe(true);
    expect(again.toCreate).toEqual([]);
  });
});
