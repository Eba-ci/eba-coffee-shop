import { describe, expect, it } from 'vitest';
import {
  checkSettle,
  firstOfNextMonth,
  payDateFor,
  splitArrears,
} from './settle-plan';

describe('dates de versement', () => {
  it('octobre se paie le 1er novembre, décembre le 1er janvier', () => {
    expect(firstOfNextMonth('2026-10')).toBe('2026-11-01');
    expect(firstOfNextMonth('2026-12')).toBe('2027-01-01');
  });

  it('le choix « aujourd’hui » et « autre date » priment sur le 1er', () => {
    expect(payDateFor('2026-10', 'first', '2026-11-15', '')).toBe('2026-11-01');
    expect(payDateFor('2026-10', 'today', '2026-11-15', '')).toBe('2026-11-15');
    expect(payDateFor('2026-10', 'custom', '2026-11-15', '2026-11-03')).toBe(
      '2026-11-03'
    );
  });
});

describe('splitArrears', () => {
  it('isole le mois qui vient de se clore des mois plus anciens', () => {
    const r = splitArrears(
      [
        { month: '2026-08', remaining: 150_000 },
        { month: '2026-10', remaining: 150_000 },
      ],
      '2026-11'
    );
    expect(r.dueNow?.month).toBe('2026-10');
    expect(r.older.map((m) => m.month)).toEqual(['2026-08']);
  });

  it('pas de mois précédent impayé : rien « à payer ce mois-ci »', () => {
    const r = splitArrears([{ month: '2026-08', remaining: 1 }], '2026-11');
    expect(r.dueNow).toBeNull();
    expect(r.older).toHaveLength(1);
  });
});

describe('checkSettle', () => {
  const lines = [
    { month: '2026-09', remaining: 150_000, amount: '150000' },
    { month: '2026-10', remaining: 150_000, amount: '100000' },
  ];

  it('construit un élément par mois, daté du 1er du mois suivant', () => {
    const r = checkSettle(lines, 'first', '2026-11-15', '');
    expect(r).toEqual({
      ok: true,
      items: [
        { month: '2026-09', date: '2026-10-01', amount: 150_000 },
        { month: '2026-10', date: '2026-11-01', amount: 100_000 },
      ],
    });
  });

  it('refuse un montant au-dessus du reste, nul ou décimal', () => {
    for (const amount of ['150001', '0', '12.5', '']) {
      const r = checkSettle(
        [{ month: '2026-09', remaining: 150_000, amount }],
        'today',
        '2026-11-15',
        ''
      );
      expect(r.ok).toBe(false);
    }
  });

  it('exige une date quand « autre date » est choisi', () => {
    expect(checkSettle(lines, 'custom', '2026-11-15', '').ok).toBe(false);
  });

  it('refuse un lot vide', () => {
    expect(checkSettle([], 'first', '2026-11-15', '').ok).toBe(false);
  });
});
