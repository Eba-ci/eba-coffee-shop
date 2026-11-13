import { describe, it, expect } from 'vitest';
import {
  expenseInputSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseCategoryInputSchema,
  expenseNatureSchema,
} from '@/lib/schemas/expense';
import { EXPENSE_ITEMS_MAX } from '@/config/constants';

describe('expenseInputSchema', () => {
  it('accepte une dépense valide (paymentMethod optionnel)', () => {
    const parsed = expenseInputSchema.parse({
      date: '2026-06-08',
      amount: 1500,
      categoryId: 'cat_1',
    });
    expect(parsed.paymentMethod).toBeUndefined();
    expect(parsed.amount).toBe(1500);
  });

  it('rejette un montant nul/négatif ou non entier', () => {
    const base = { date: '2026-06-08', categoryId: 'c' };
    expect(expenseInputSchema.safeParse({ ...base, amount: 0 }).success).toBe(
      false
    );
    expect(expenseInputSchema.safeParse({ ...base, amount: -5 }).success).toBe(
      false
    );
    expect(expenseInputSchema.safeParse({ ...base, amount: 1.5 }).success).toBe(
      false
    );
  });

  it('rejette une date mal formatée', () => {
    expect(
      expenseInputSchema.safeParse({
        date: '08/06/2026',
        amount: 100,
        categoryId: 'c',
      }).success
    ).toBe(false);
  });

  it('accepte un chemin de justificatif relatif', () => {
    const parsed = expenseInputSchema.parse({
      date: '2026-06-08',
      amount: 100,
      categoryId: 'c',
      receiptUrl: '/uploads/receipts/abc.jpg',
    });
    expect(parsed.receiptUrl).toBe('/uploads/receipts/abc.jpg');
  });
});

describe('expenseCreateSchema — liaison à une occurrence', () => {
  const base = { date: '2026-11-11', amount: 1000, categoryId: 'c' };

  it('accepte aucune liaison', () => {
    expect(expenseCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepte fixedCostId + dueDate ensemble', () => {
    expect(
      expenseCreateSchema.safeParse({
        ...base,
        fixedCostId: 'fc1',
        dueDate: '2026-11-05',
      }).success
    ).toBe(true);
  });

  it('refuse un seul des deux', () => {
    expect(
      expenseCreateSchema.safeParse({ ...base, fixedCostId: 'fc1' }).success
    ).toBe(false);
    expect(
      expenseCreateSchema.safeParse({ ...base, dueDate: '2026-11-05' }).success
    ).toBe(false);
  });

  it('accepte les deux à null', () => {
    expect(
      expenseCreateSchema.safeParse({
        ...base,
        fixedCostId: null,
        dueDate: null,
      }).success
    ).toBe(true);
  });
});

describe('expenseUpdateSchema', () => {
  it('exige au moins un champ', () => {
    expect(expenseUpdateSchema.safeParse({}).success).toBe(false);
    expect(expenseUpdateSchema.safeParse({ amount: 200 }).success).toBe(true);
  });

  it('exclut la liaison à une occurrence (fixedCostId/dueDate)', () => {
    // Fournis seuls, ils sont retirés : plus rien à mettre à jour.
    expect(
      expenseUpdateSchema.safeParse({
        fixedCostId: 'fc1',
        dueDate: '2026-11-05',
      }).success
    ).toBe(false);
    // Fournis avec un vrai champ, ils sont ignorés (jamais renvoyés).
    const parsed = expenseUpdateSchema.parse({
      amount: 200,
      fixedCostId: 'fc1',
      dueDate: '2026-11-05',
    });
    expect('fixedCostId' in parsed).toBe(false);
    expect('dueDate' in parsed).toBe(false);
  });
});

describe('expenseCategoryInputSchema', () => {
  it('trim et exige un nom non vide', () => {
    expect(expenseCategoryInputSchema.parse({ name: '  Loyer ' }).name).toBe(
      'Loyer'
    );
    expect(expenseCategoryInputSchema.safeParse({ name: '   ' }).success).toBe(
      false
    );
  });
});

describe('expenseNatureSchema', () => {
  it('accepte FIXED et VARIABLE', () => {
    expect(expenseNatureSchema.safeParse('FIXED').success).toBe(true);
    expect(expenseNatureSchema.safeParse('VARIABLE').success).toBe(true);
  });

  it('rejette toute autre valeur', () => {
    expect(expenseNatureSchema.safeParse('AUTRE').success).toBe(false);
    expect(expenseNatureSchema.safeParse('fixed').success).toBe(false);
    expect(expenseNatureSchema.safeParse('').success).toBe(false);
  });
});

describe('expenseInputSchema — détail par article (items)', () => {
  const base = { date: '2026-07-10', amount: 13000, categoryId: 'c' };

  it('items absent (dépense globale historique)', () => {
    const r = expenseInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.items).toBeUndefined();
  });

  it('items: null accepté (équivalent à absent)', () => {
    expect(expenseInputSchema.safeParse({ ...base, items: null }).success).toBe(
      true
    );
  });

  it('items: [...] jusqu’à EXPENSE_ITEMS_MAX lignes', () => {
    const items = Array.from({ length: EXPENSE_ITEMS_MAX }, (_, i) => ({
      rawLabel: `Article ${i}`,
      amount: 100,
    }));
    expect(expenseInputSchema.safeParse({ ...base, items }).success).toBe(true);
  });

  it('rejette plus de EXPENSE_ITEMS_MAX lignes', () => {
    const items = Array.from({ length: EXPENSE_ITEMS_MAX + 1 }, (_, i) => ({
      rawLabel: `Article ${i}`,
      amount: 100,
    }));
    expect(expenseInputSchema.safeParse({ ...base, items }).success).toBe(
      false
    );
  });
});
