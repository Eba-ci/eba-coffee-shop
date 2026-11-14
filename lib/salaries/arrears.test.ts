// Impayés et arriéré (#444) : seuls les mois STRICTEMENT antérieurs au mois de
// référence comptent ; l'arriéré ne touche jamais le dû ni le total global (le
// point mort ne compte pas deux fois un salaire déjà rattaché à son mois).

import { describe, expect, it } from 'vitest';
import {
  salaryArrears,
  salaryDueForMonth,
  salaryLedger,
  salaryPaymentProposal,
  type EmployeeLike,
  type SalaryMonthSummary,
  type SalaryPaymentLike,
  type SalaryRateLike,
} from './compute';
import { monthRange } from './month';

const employee: EmployeeLike = { startDate: '2020-01-01', endDate: null };
const rate: SalaryRateLike = {
  monthlyAmount: 300_000,
  startDate: '2020-01-01',
};

const summary = (
  month: string,
  remainingToPay: number,
  due = 300_000
): SalaryMonthSummary => ({
  month,
  due,
  baseDue: due,
  primes: 0,
  retenues: 0,
  salariesPaid: due - remainingToPay,
  advancesPaid: 0,
  advanceGiven: 0,
  advanceRecovered: 0,
  remainingToPay,
  overpaid: 0,
  advanceBalance: 0,
});

describe('salaryArrears', () => {
  it('un employé payé intégralement chaque mois a un arriéré de 0', () => {
    expect(
      salaryArrears([summary('2026-09', 0), summary('2026-10', 0)], '2026-10')
    ).toEqual({ total: 0, oldestMonth: null, months: [] });
  });

  it('40 000 F restants en septembre remontent en arriéré en octobre', () => {
    const a = salaryArrears(
      [summary('2026-09', 40_000), summary('2026-10', 0)],
      '2026-10'
    );
    expect(a.total).toBe(40_000);
    expect(a.oldestMonth).toBe('2026-09');
    expect(a.months).toEqual([{ month: '2026-09', remaining: 40_000 }]);
  });

  it('le mois courant avec un reste à payer n’est pas un impayé', () => {
    const a = salaryArrears(
      [summary('2026-09', 0), summary('2026-10', 120_000)],
      '2026-10'
    );
    expect(a.total).toBe(0);
    expect(a.months).toEqual([]);
  });

  it('cumule les mois clôturés, du plus ancien au plus récent', () => {
    const a = salaryArrears(
      [
        summary('2026-07', 10_000),
        summary('2026-08', 90_000),
        summary('2026-09', 0),
        summary('2026-10', 50_000),
      ],
      '2026-10'
    );
    expect(a.total).toBe(100_000);
    expect(a.oldestMonth).toBe('2026-07');
    expect(a.months.map((m) => m.month)).toEqual(['2026-07', '2026-08']);
  });
});

describe('montant proposé au paiement', () => {
  it('inclut l’arriéré, mois courant d’abord puis les mois les plus anciens', () => {
    const current = summary('2026-10', 50_000);
    const arrears = salaryArrears(
      [summary('2026-07', 10_000), summary('2026-08', 90_000)],
      '2026-10'
    );
    const proposal = salaryPaymentProposal(current, arrears);
    expect(proposal.total).toBe(150_000);
    expect(proposal.allocations).toEqual([
      { month: '2026-10', amount: 50_000 },
      { month: '2026-07', amount: 10_000 },
      { month: '2026-08', amount: 90_000 },
    ]);
  });
});

describe('arriéré et point mort (anti double comptage)', () => {
  it('l’existence d’impayés ne change pas le total des dûs', () => {
    const payments: SalaryPaymentLike[] = [
      // Septembre largement sous-payé : 40 000 F restent dus.
      { month: '2026-09', type: 'SALAIRE', amount: 260_000 },
    ];
    const ledger = salaryLedger({
      employee,
      rates: [rate],
      payments,
      months: monthRange('2026-09', '2026-10'),
    });
    const arrears = salaryArrears(ledger, '2026-10');
    expect(arrears.total).toBe(40_000);
    // Le total global (somme des dûs) ne dépend QUE des taux et primes : il est
    // identique avec ou sans impayé, donc le point mort ne double pas la dette.
    expect(ledger.reduce((a, m) => a + m.due, 0)).toBe(600_000);
    expect(salaryDueForMonth(employee, [rate], '2026-09').due).toBe(300_000);
    expect(salaryDueForMonth(employee, [rate], '2026-10').due).toBe(300_000);
  });

  it('un versement annulé ne compte ni dans le dû soldé ni dans l’arriéré', () => {
    const ledger = salaryLedger({
      employee,
      rates: [rate],
      payments: [
        {
          month: '2026-09',
          type: 'SALAIRE',
          amount: 300_000,
          canceledAt: new Date(),
        },
      ],
      months: monthRange('2026-09', '2026-10'),
    });
    expect(ledger[0].salariesPaid).toBe(0);
    expect(salaryArrears(ledger, '2026-10').total).toBe(300_000);
  });
});
