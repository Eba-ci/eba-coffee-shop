// lib/cash-closing-compute.test.ts
import { describe, it, expect } from 'vitest';
import { computeClosing } from '@/lib/cash-closing-compute';

describe('computeClosing', () => {
  it('caisse théorique = fond + ventes espèces − dépenses espèces', () => {
    const r = computeClosing({
      openingFloat: 10000,
      cashSales: 50000,
      cashExpenses: 8000,
      cashRefunds: 0,
      countedCash: 52000,
    });
    expect(r.expectedCash).toBe(52000);
    expect(r.difference).toBe(0);
  });

  it('écart positif si on compte plus que prévu', () => {
    const r = computeClosing({
      openingFloat: 0,
      cashSales: 30000,
      cashExpenses: 0,
      cashRefunds: 0,
      countedCash: 31000,
    });
    expect(r.expectedCash).toBe(30000);
    expect(r.difference).toBe(1000);
  });

  it('écart négatif (manquant) si on compte moins', () => {
    const r = computeClosing({
      openingFloat: 5000,
      cashSales: 20000,
      cashExpenses: 3000,
      cashRefunds: 0,
      countedCash: 21000,
    });
    expect(r.expectedCash).toBe(22000);
    expect(r.difference).toBe(-1000);
  });

  it('les remboursements rendus en espèces sortent du tiroir', () => {
    const r = computeClosing({
      openingFloat: 10000,
      cashSales: 50000,
      cashExpenses: 8000,
      cashRefunds: 2500,
      countedCash: 49500,
    });
    expect(r.expectedCash).toBe(49500);
    expect(r.difference).toBe(0);
  });

  it('un salaire payé en espèces baisse la caisse théorique (Wave ne la touche pas)', () => {
    const base = {
      openingFloat: 10000,
      cashSales: 50000,
      cashRefunds: 0,
      countedCash: 0,
    };
    const sansSalaire = computeClosing({ ...base, cashExpenses: 5000 });
    const avecSalaireEspeces = computeClosing({
      ...base,
      cashExpenses: 5000 + 15000,
    });
    // Wave n'apparaît pas dans `cashExpenses` : la caisse reste identique.
    const avecSalaireWave = computeClosing({ ...base, cashExpenses: 5000 });

    expect(sansSalaire.expectedCash).toBe(55000);
    expect(avecSalaireEspeces.expectedCash).toBe(40000);
    expect(avecSalaireWave.expectedCash).toBe(sansSalaire.expectedCash);
  });
});
