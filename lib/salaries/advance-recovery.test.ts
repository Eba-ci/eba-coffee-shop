import { describe, expect, it } from 'vitest';
import { advanceRecoveredBefore } from './advance-recovery';
import type { AdvanceLike } from './types';

const advance = (patch: Partial<AdvanceLike> = {}): AdvanceLike => ({
  month: '2026-06',
  amount: 30_000,
  recoveryMonths: 3,
  ...patch,
});

describe('avance : montant déjà récupéré avant un mois', () => {
  it('ne compte que les mois strictement antérieurs', () => {
    // Étale 30 000 sur 3 mois : 2026-07, 2026-08, 2026-09 (10 000 chacun).
    const a = advance();
    expect(advanceRecoveredBefore(a, '2026-07')).toBe(0);
    expect(advanceRecoveredBefore(a, '2026-08')).toBe(10_000);
    expect(advanceRecoveredBefore(a, '2026-09')).toBe(20_000);
    expect(advanceRecoveredBefore(a, '2026-10')).toBe(30_000);
    expect(advanceRecoveredBefore(a, '2027-01')).toBe(30_000);
  });

  it('défaut : récupération en une fois le mois suivant', () => {
    const a = advance({ recoveryMonths: undefined });
    expect(advanceRecoveredBefore(a, '2026-07')).toBe(0);
    expect(advanceRecoveredBefore(a, '2026-08')).toBe(30_000);
  });

  it('le reliquat d’étalement retombe exactement sur le montant', () => {
    const a = advance({ amount: 100_000, recoveryMonths: 7 });
    expect(advanceRecoveredBefore(a, '2030-01')).toBe(100_000);
  });
});
