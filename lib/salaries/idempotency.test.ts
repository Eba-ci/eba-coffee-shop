import { describe, expect, it } from 'vitest';
import { SalaryIdempotencyConflictError } from './errors';
import {
  assertSameSalaryPayment,
  sameSalaryPayment,
  type SalaryPaymentIdentity,
} from './idempotency';

const base: SalaryPaymentIdentity = {
  employeeId: 'emp-1',
  date: '2026-06-30',
  month: '2026-06',
  amount: 300_000,
  type: 'SALAIRE',
};

describe('idempotence des versements', () => {
  it('contenu identique : le versement existant est accepté', () => {
    expect(sameSalaryPayment(base, { ...base })).toBe(true);
    expect(() => assertSameSalaryPayment(base, { ...base })).not.toThrow();
  });

  it.each([
    ['employé', { employeeId: 'emp-2' }],
    ['montant', { amount: 250_000 }],
    ['date', { date: '2026-07-01' }],
    ['type', { type: 'ACOMPTE' as const }],
    ['mois', { month: '2026-07' }],
  ])('contenu différent (%s) : conflit', (_label, patch) => {
    const desired = { ...base, ...patch };
    expect(sameSalaryPayment(base, desired)).toBe(false);
    expect(() => assertSameSalaryPayment(base, desired)).toThrow(
      SalaryIdempotencyConflictError
    );
  });
});
