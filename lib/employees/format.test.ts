import { describe, expect, it } from 'vitest';
import { initials, settlementState } from './format';

describe('format Employés — état d’apurement', () => {
  it('soldé quand le mois est payé et sans arriéré', () => {
    expect(settlementState({ remainingToPay: 0, arrearsTotal: 0 })).toBe(
      'settled'
    );
  });

  it('partiel quand le mois reste à payer sans arriéré', () => {
    expect(settlementState({ remainingToPay: 50_000, arrearsTotal: 0 })).toBe(
      'partial'
    );
  });

  it('en retard dès qu’un mois clôturé est impayé', () => {
    expect(settlementState({ remainingToPay: 0, arrearsTotal: 25_000 })).toBe(
      'late'
    );
    expect(settlementState({ remainingToPay: 50_000, arrearsTotal: 1 })).toBe(
      'late'
    );
  });

  it('initiales', () => {
    expect(initials('Awa Traoré')).toBe('AT');
    expect(initials('Aïcha')).toBe('A');
    expect(initials('  ')).toBe('?');
  });
});
