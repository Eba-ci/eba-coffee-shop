import { describe, expect, it } from 'vitest';
import { proposeOccurrenceLinks } from './link-proposals';
import { occurrencesInRange, type LinkedPayment } from './schedule';

const cost = {
  id: 'c1',
  label: 'Loyer',
  amount: 50_000,
  periodicity: 'MONTHLY' as const,
  startDate: '2026-03-10',
  endDate: null,
  active: true,
  categoryId: 'cat',
  installments: [],
};
const occ = (payments: LinkedPayment[] = []) =>
  occurrencesInRange(cost, '2026-03-01', '2026-05-31', payments, '2026-11-15');

describe('proposeOccurrenceLinks', () => {
  it('propose ensemble 50 000 F le 15 mars et l’échéance du 10 mars', () => {
    const [p] = proposeOccurrenceLinks(
      [{ id: 'e1', date: '2026-03-15', amount: 50_000, categoryId: 'cat' }],
      occ()
    );
    expect(p).toEqual({
      expenseId: 'e1',
      costId: 'c1',
      occurrenceDueDate: '2026-03-10',
      score: 1,
      delta: 0,
    });
  });

  it('affiche l’écart de montant signé et classe par score', () => {
    const res = proposeOccurrenceLinks(
      [
        { id: 'near', date: '2026-04-12', amount: 45_000, categoryId: 'cat' },
        { id: 'exact', date: '2026-03-12', amount: 50_000, categoryId: 'cat' },
      ],
      occ()
    );
    expect(res.map((r) => r.expenseId)).toEqual(['exact', 'near']);
    expect(res[1].delta).toBe(-5_000);
    expect(res[1].score).toBeCloseTo(0.9);
  });

  it('ignore une autre catégorie, un autre mois ou un montant trop éloigné', () => {
    const res = proposeOccurrenceLinks(
      [
        { id: 'a', date: '2026-03-15', amount: 50_000, categoryId: 'autre' },
        { id: 'b', date: '2026-07-15', amount: 50_000, categoryId: 'cat' },
        { id: 'c', date: '2026-03-15', amount: 5_000, categoryId: 'cat' },
      ],
      occ()
    );
    expect(res).toEqual([]);
  });

  it('une proposition au plus par dépense, jamais sur une échéance déjà réglée', () => {
    const paid = occ([
      {
        expenseId: 'x',
        fixedCostId: 'c1',
        dueDate: '2026-03-10',
        amount: 50_000,
      },
    ]);
    const res = proposeOccurrenceLinks(
      [{ id: 'e1', date: '2026-03-15', amount: 50_000, categoryId: 'cat' }],
      paid
    );
    expect(res).toEqual([]);
  });

  it('ne produit que des propositions : aucune écriture, résultat pur', () => {
    const exp = [
      { id: 'e1', date: '2026-03-15', amount: 50_000, categoryId: 'cat' },
    ];
    const snapshot = JSON.stringify(exp);
    proposeOccurrenceLinks(exp, occ());
    expect(JSON.stringify(exp)).toBe(snapshot);
  });
});
