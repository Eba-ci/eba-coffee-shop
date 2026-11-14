// Primes et retenues (#443) : le dû du mois = prorata des taux + primes −
// retenues ; un ajustement annulé sort des calculs sans être supprimé ; une
// retenue supérieure au prorata des taux est refusée (pas de dette négative).
// Le total global (point mort) passe par le même `due`, sans second chemin.

import { describe, expect, it } from 'vitest';
import {
  salaryDueForMonth,
  salaryLedger,
  type EmployeeLike,
  type SalaryAdjustmentLike,
  type SalaryRateLike,
} from './compute';
import { monthRange } from './month';

const employee: EmployeeLike = { startDate: '2020-01-01', endDate: null };
const rate = (monthlyAmount: number): SalaryRateLike => ({
  monthlyAmount,
  startDate: '2020-01-01',
});
const prime = (month: string, amount: number): SalaryAdjustmentLike => ({
  month,
  nature: 'PRIME',
  amount,
});
const retenue = (month: string, amount: number): SalaryAdjustmentLike => ({
  month,
  nature: 'RETENUE',
  amount,
});

describe('primes et retenues dans le dû', () => {
  it('une prime de 50 000 F augmente le dû du mois du même montant', () => {
    const without = salaryDueForMonth(employee, [rate(300_000)], '2026-11');
    const withPrime = salaryDueForMonth(employee, [rate(300_000)], '2026-11', [
      prime('2026-11', 50_000),
    ]);
    expect(without.due).toBe(300_000);
    expect(withPrime.baseDue).toBe(300_000);
    expect(withPrime.primes).toBe(50_000);
    expect(withPrime.retenues).toBe(0);
    expect(withPrime.due).toBe(350_000);
    // L'arrondi du prorata ne bouge pas : les segments valent toujours le dû
    // des taux (la prime s'ajoute après).
    expect(withPrime.segments.reduce((a, s) => a + s.amount, 0)).toBe(
      withPrime.baseDue
    );
  });

  it('une retenue diminue le dû, sans descendre sous zéro', () => {
    const adjusted = salaryDueForMonth(employee, [rate(300_000)], '2026-11', [
      retenue('2026-11', 40_000),
    ]);
    expect(adjusted.due).toBe(260_000);
    expect(adjusted.retenues).toBe(40_000);
    expect(() =>
      salaryDueForMonth(employee, [rate(300_000)], '2026-11', [
        retenue('2026-11', 300_001),
      ])
    ).toThrow(/retenue dépasse le salaire dû/i);
  });

  it('cumule plusieurs primes et retenues du même mois', () => {
    const d = salaryDueForMonth(employee, [rate(300_000)], '2026-11', [
      prime('2026-11', 50_000),
      prime('2026-11', 10_000),
      retenue('2026-11', 15_000),
    ]);
    expect(d.due).toBe(345_000);
  });

  it('ignore un ajustement annulé, sans le supprimer de l’historique', () => {
    const d = salaryDueForMonth(employee, [rate(300_000)], '2026-11', [
      { ...prime('2026-11', 50_000), canceledAt: new Date() },
    ]);
    expect(d.primes).toBe(0);
    expect(d.due).toBe(300_000);
  });

  it('absence d’ajustement : comportement inchangé', () => {
    const d = salaryDueForMonth(employee, [rate(300_000)], '2026-11', []);
    expect(d.due).toBe(300_000);
    expect(d.primes).toBe(0);
    expect(d.retenues).toBe(0);
  });

  it('le journal du mois porte les primes et retenues, et le reste à payer', () => {
    const ledger = salaryLedger({
      employee,
      rates: [rate(300_000)],
      payments: [],
      adjustments: [prime('2026-11', 50_000), retenue('2026-11', 10_000)],
      months: monthRange('2026-10', '2026-11'),
    });
    expect(ledger[0]).toMatchObject({ due: 300_000, primes: 0, retenues: 0 });
    expect(ledger[1]).toMatchObject({
      due: 340_000,
      primes: 50_000,
      retenues: 10_000,
      remainingToPay: 340_000,
    });
  });
});
