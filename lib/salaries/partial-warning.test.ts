import { describe, expect, it } from 'vitest';
import { salaryLedgerThrough } from './ledger';
import { salaryPaymentWarning } from './partial-warning';
import type { SalaryPaymentLike } from './types';

const employee = { startDate: '2020-01-01', endDate: null };
const rates = [{ monthlyAmount: 150_000, startDate: '2020-01-01' }];

describe('salaryPaymentWarning', () => {
  const s = { remaining: 150_000, arrears: 0 };

  it('montant inférieur au reste : reliquat exact', () => {
    expect(salaryPaymentWarning(100_000, s)).toEqual({
      kind: 'partial',
      unpaid: 50_000,
      arrears: 0,
    });
  });

  it('distingue le reste du mois et l’arriéré préexistant', () => {
    expect(
      salaryPaymentWarning(100_000, { remaining: 150_000, arrears: 80_000 })
    ).toEqual({ kind: 'partial', unpaid: 50_000, arrears: 80_000 });
  });

  it('montant égal au reste : aucun message', () => {
    expect(salaryPaymentWarning(150_000, s)).toBeNull();
  });

  it('montant supérieur : excédent signalé', () => {
    expect(salaryPaymentWarning(170_000, s)).toEqual({
      kind: 'excess',
      excess: 20_000,
      arrears: 0,
    });
  });

  it('arriéré seul : on règle une dette', () => {
    expect(
      salaryPaymentWarning(50_000, { remaining: 0, arrears: 80_000 })
    ).toEqual({ kind: 'arrears-only', arrears: 80_000, excess: 50_000 });
  });

  it('employé sans dû : message explicite', () => {
    expect(salaryPaymentWarning(10_000, { remaining: 0, arrears: 0 })).toEqual({
      kind: 'nothing-due',
      excess: 10_000,
    });
  });

  it('montant vide ou invalide : aucun message', () => {
    expect(salaryPaymentWarning(0, s)).toBeNull();
    expect(salaryPaymentWarning(NaN, s)).toBeNull();
  });

  it('le reliquat affiché égale le remainingToPay du journal après versement', () => {
    const month = '2026-11';
    const last = (payments: SalaryPaymentLike[]) => {
      const l = salaryLedgerThrough({ employee, rates, payments, month });
      return l[l.length - 1];
    };
    const amount = 100_000;
    const w = salaryPaymentWarning(amount, {
      remaining: last([]).remainingToPay,
      arrears: 0,
    });
    const after = last([{ month, type: 'SALAIRE', amount }]);
    expect(w).toMatchObject({ kind: 'partial' });
    expect(w && 'unpaid' in w ? w.unpaid : -1).toBe(after.remainingToPay);
  });
});
