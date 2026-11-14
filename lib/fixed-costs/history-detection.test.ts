import { describe, expect, it } from 'vitest';
import {
  detectFixedCostHistory,
  type HistoryCategory,
  type HistoryExpense,
} from './history-detection';

const cat = (
  id: string,
  name: string,
  hasFixedCost = false
): HistoryCategory => ({ id, name, hasFixedCost });

const exp = (date: string, amount: number): HistoryExpense => ({
  date,
  amount,
});

const byCategory = (entries: Record<string, HistoryExpense[]>) => entries;

describe('detectFixedCostHistory', () => {
  it('propose le premier mois payé et signale « puis plus rien » après le dernier', () => {
    const [row] = detectFixedCostHistory(
      [cat('loyer', 'Loyer')],
      byCategory({
        loyer: [
          exp('2026-03-05', 150_000),
          exp('2026-04-05', 150_000),
          exp('2026-05-05', 150_000),
        ],
      }),
      '2026-11'
    );

    expect(row.firstMonth).toBe('2026-03');
    expect(row.lastMonth).toBe('2026-05');
    expect(row.suggestedStartMonth).toBe('2026-03');
    expect(row.suggestedPeriodicity).toBe('MONTHLY');
    expect(row.gaps).toEqual([]);
    // Juin → novembre : aucun paiement connu après mai.
    expect(row.trailingGaps).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(row.confidence).toBe('probable');
    expect(row.alreadyConverted).toBe(false);
  });

  it('classe une dépense unique « single », non proposée à la conversion', () => {
    const [row] = detectFixedCostHistory(
      [cat('unique', 'Achat ponctuel')],
      byCategory({ unique: [exp('2026-04-12', 75_000)] }),
      '2026-11'
    );

    expect(row.months).toEqual([{ month: '2026-04', total: 75_000, count: 1 }]);
    expect(row.confidence).toBe('single');
    expect(row.trailingGaps).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
  });

  it('marque comme déjà convertie une catégorie liée à une charge fixe', () => {
    const [row] = detectFixedCostHistory(
      [cat('loyer', 'Loyer', true)],
      byCategory({ loyer: [exp('2026-03-01', 1_000)] })
    );

    expect(row.alreadyConverted).toBe(true);
    expect(row.confidence).toBe('single');
  });

  it('additionne exactement les dépenses du mois (total et nombre)', () => {
    const [row] = detectFixedCostHistory(
      [cat('internet', 'Internet')],
      byCategory({
        internet: [
          exp('2026-03-01', 100_000),
          exp('2026-03-20', 50_000),
          exp('2026-04-02', 200_000),
        ],
      })
    );

    expect(row.months).toEqual([
      { month: '2026-03', total: 150_000, count: 2 },
      { month: '2026-04', total: 200_000, count: 1 },
    ]);
    expect(row.total).toBe(350_000);
    expect(row.expenseCount).toBe(3);
    expect(row.confidence).toBe('to-review');
  });

  it('n’affiche jamais la catégorie Salaires (casse et accents ignorés)', () => {
    const rows = detectFixedCostHistory(
      [
        cat('s1', 'Salaires'),
        cat('s2', 'SALAIRES'),
        cat('s3', 'salaire'),
        cat('ok', 'Loyer'),
      ],
      byCategory({
        s1: [exp('2026-03-01', 500_000)],
        s2: [exp('2026-03-01', 500_000)],
        s3: [exp('2026-03-01', 500_000)],
        ok: [exp('2026-03-01', 150_000)],
      })
    );

    expect(rows.map((r) => r.categoryName)).toEqual(['Loyer']);
  });

  it('calcule les trous internes, y compris au passage d’année', () => {
    const [row] = detectFixedCostHistory(
      [cat('eau', 'Eau')],
      byCategory({
        eau: [exp('2025-11-02', 10_000), exp('2026-02-02', 10_000)],
      })
    );

    expect(row.gaps).toEqual(['2025-12', '2026-01']);
    expect(row.confidence).toBe('to-review');
  });

  it('passe « à vérifier » quand les montants sont très irréguliers', () => {
    const [row] = detectFixedCostHistory(
      [cat('gaz', 'Gaz')],
      byCategory({
        gaz: [
          exp('2026-01-01', 100_000),
          exp('2026-02-01', 100_000),
          exp('2026-03-01', 300_000),
        ],
      })
    );

    expect(row.gaps).toEqual([]);
    expect(row.confidence).toBe('to-review');
  });

  it('ignore les catégories sans dépense et les dates invalides', () => {
    const rows = detectFixedCostHistory(
      [cat('vide', 'Vide'), cat('ok', 'Ok')],
      byCategory({
        vide: [],
        ok: [exp('pas-une-date', 10_000), exp('2026-03-01', 20_000)],
      })
    );

    expect(rows.map((r) => r.categoryId)).toEqual(['ok']);
    expect(rows[0].months).toEqual([
      { month: '2026-03', total: 20_000, count: 1 },
    ]);
  });

  it('ne fabrique pas de trou après le dernier mois sans mois de référence', () => {
    const [row] = detectFixedCostHistory(
      [cat('loyer', 'Loyer')],
      byCategory({
        loyer: [
          exp('2026-03-01', 1_000),
          exp('2026-04-01', 1_000),
          exp('2026-05-01', 1_000),
        ],
      })
    );

    expect(row.trailingGaps).toEqual([]);
  });
});
