import { describe, expect, it } from 'vitest';
import { planCategoryImport } from './category-import';

const cat = (
  id: string,
  name: string,
  lastAmount: number | null,
  firstExpenseMonth: string | null = '2025-03'
) => ({ id, name, lastAmount, firstExpenseMonth });

const RUN = '2026-11';

describe('planCategoryImport', () => {
  it('importe avec le dernier montant et le mois de la première dépense', () => {
    const p = planCategoryImport(
      [
        cat('a', 'Loyer', 150000, '2025-03'),
        cat('b', 'Internet', null, null),
        cat('c', 'Eau', 0, '2025-06'),
      ],
      new Set(),
      RUN
    );
    expect(p.toImport).toEqual([
      {
        categoryId: 'a',
        label: 'Loyer',
        amount: 150000,
        startMonth: '2025-03',
      },
    ]);
    expect(p.toComplete).toEqual(['Internet', 'Eau']);
  });

  it('ignore « Salaires » (casse/accents repliés), même avec un montant', () => {
    const p = planCategoryImport(
      [
        cat('s', 'SALAIRES', 500000),
        cat('t', 'salaire', null, null),
      ],
      new Set(),
      RUN
    );
    expect(p.toImport).toEqual([]);
    expect(p.toComplete).toEqual([]);
    expect(p.skippedSalary).toEqual(['SALAIRES', 'salaire']);
  });

  it('est idempotent : une catégorie déjà liée ne ressort pas', () => {
    const cats = [cat('a', 'Loyer', 150000), cat('b', 'Internet', null)];
    const p = planCategoryImport(cats, new Set(['a', 'b']), RUN);
    expect(p.toImport).toEqual([]);
    expect(p.toComplete).toEqual([]);
    expect(p.alreadyLinked).toBe(2);
  });

  it('prend le commentaire de la dernière dépense comme libellé, sinon le nom', () => {
    const p = planCategoryImport(
      [
        { ...cat('a', 'Fixe', 150000), lastNote: '  Loyer boutique  ' },
        { ...cat('b', 'Eau', 8000), lastNote: '   ' },
        cat('c', 'Internet', 20000),
      ],
      new Set(),
      RUN
    );
    expect(p.toImport.map((r) => r.label)).toEqual([
      'Loyer boutique',
      'Eau',
      'Internet',
    ]);
  });

  it('retombe sur le mois courant si un montant existe sans première dépense', () => {
    const p = planCategoryImport(
      [cat('a', 'Loyer', 150000, null)],
      new Set(),
      RUN
    );
    expect(p.toImport[0].startMonth).toBe(RUN);
  });
});