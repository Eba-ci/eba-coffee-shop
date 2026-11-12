import { describe, expect, it } from 'vitest';
import { planCategoryImport } from './category-import';

const cat = (id: string, name: string, lastAmount: number | null) => ({
  id,
  name,
  lastAmount,
});

describe('planCategoryImport', () => {
  it('importe avec le dernier montant, signale les catégories sans montant', () => {
    const p = planCategoryImport(
      [
        cat('a', 'Loyer', 150000),
        cat('b', 'Internet', null),
        cat('c', 'Eau', 0),
      ],
      new Set()
    );
    expect(p.toImport).toEqual([
      { categoryId: 'a', label: 'Loyer', amount: 150000 },
    ]);
    expect(p.toComplete).toEqual(['Internet', 'Eau']);
  });

  it('ignore « Salaires » (casse/accents repliés), même avec un montant', () => {
    const p = planCategoryImport(
      [cat('s', 'SALAIRES', 500000), cat('t', 'salaire', null)],
      new Set()
    );
    expect(p.toImport).toEqual([]);
    expect(p.toComplete).toEqual([]);
    expect(p.skippedSalary).toEqual(['SALAIRES', 'salaire']);
  });

  it('est idempotent : une catégorie déjà liée ne ressort pas', () => {
    const cats = [cat('a', 'Loyer', 150000), cat('b', 'Internet', null)];
    const p = planCategoryImport(cats, new Set(['a', 'b']));
    expect(p.toImport).toEqual([]);
    expect(p.toComplete).toEqual([]);
    expect(p.alreadyLinked).toBe(2);
  });
});
