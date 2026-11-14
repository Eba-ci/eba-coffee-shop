import { describe, expect, it } from 'vitest';
import {
  draftFromRow,
  draftToPayload,
  isDraftDirty,
  validateDraft,
} from './fixed-cost-draft';
import { emptyDraft, type Draft } from './fixed-cost-fields';

const row = {
  label: 'Loyer',
  amount: 300000,
  periodicity: 'MONTHLY' as const,
  startDate: '2026-01-05',
  endDate: '2026-12-31',
  categoryId: 'cat-loyer',
  note: 'Bail 2026',
  installments: [
    { monthOffset: 0, day: 5, amount: 150000 },
    { monthOffset: 0, day: 20, amount: 150000 },
  ],
};

const filled = (over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft('cat-loyer'),
  label: 'Loyer',
  amount: '300000',
  startDate: '2026-01-05',
  ...over,
});

describe('draftFromRow — édition préremplie', () => {
  it('reprend tous les champs, échéances comprises', () => {
    expect(draftFromRow(row)).toEqual({
      label: 'Loyer',
      amount: '300000',
      periodicity: 'MONTHLY',
      startDate: '2026-01-05',
      endDate: '2026-12-31',
      categoryId: 'cat-loyer',
      note: 'Bail 2026',
      installments: [
        { monthOffset: '0', day: '5', amount: '150000' },
        { monthOffset: '0', day: '20', amount: '150000' },
      ],
    });
  });

  it('laisse la fin et la note vides quand elles sont absentes', () => {
    const d = draftFromRow({ ...row, endDate: null, note: null });
    expect(d.endDate).toBe('');
    expect(d.note).toBe('');
  });
});

describe('draftToPayload — création', () => {
  it('convertit les montants et les échéances en nombres', () => {
    const payload = draftToPayload(
      filled({
        installments: [{ monthOffset: '0', day: '5', amount: '300000' }],
      })
    );
    expect(payload).toMatchObject({
      label: 'Loyer',
      amount: 300000,
      periodicity: 'MONTHLY',
      startDate: '2026-01-05',
      endDate: null,
      categoryId: 'cat-loyer',
      note: null,
      installments: [{ monthOffset: 0, day: 5, amount: 300000 }],
    });
  });

  it('trime la note et conserve les dates saisies', () => {
    const payload = draftToPayload(
      filled({ note: '  Bail 2026  ', endDate: '2026-12-31' })
    );
    expect(payload.note).toBe('Bail 2026');
    expect(payload.endDate).toBe('2026-12-31');
  });
});

describe('validateDraft', () => {
  it('accepte un brouillon complet', () => {
    expect(validateDraft(filled())).toBeNull();
  });
  it('refuse un libellé ou un montant vide', () => {
    expect(validateDraft(filled({ label: '  ' }))).toBe(
      'Libellé et montant requis'
    );
    expect(validateDraft(filled({ amount: '0' }))).toBe(
      'Libellé et montant requis'
    );
  });
  it('refuse une catégorie manquante', () => {
    expect(validateDraft(filled({ categoryId: '' }))).toBe(
      'Choisis une catégorie'
    );
  });
});

describe('isDraftDirty — fermeture sans / avec modification', () => {
  it('un drawer vierge n’est pas modifié', () => {
    const initial = emptyDraft('cat-loyer');
    expect(isDraftDirty(initial, { ...initial })).toBe(false);
  });

  it('un champ retouché est détecté', () => {
    const initial = draftFromRow(row);
    expect(isDraftDirty(initial, { ...initial, label: 'Loyer bureau' })).toBe(
      true
    );
  });

  it('une échéance retouchée ou ajoutée est détectée', () => {
    const initial = draftFromRow(row);
    expect(
      isDraftDirty(initial, {
        ...initial,
        installments: [{ ...initial.installments[0], day: '6' }],
      })
    ).toBe(true);
    expect(
      isDraftDirty(initial, {
        ...initial,
        installments: [
          ...initial.installments,
          { monthOffset: '0', day: '', amount: '' },
        ],
      })
    ).toBe(true);
  });
});
