import { describe, expect, it } from 'vitest';
import {
  advanceRecoverySchedule,
  salaryDueForMonth,
  salaryLedger,
  summarizeSalaryMonth,
  type EmployeeLike,
  type SalaryPaymentLike,
  type SalaryRateLike,
} from './compute';
import { monthRange, nextMonth } from './month';
import { splitAmount } from './money';

// Juin 2026 = 30 jours ; le salarié par défaut est en poste depuis longtemps.
const employee: EmployeeLike = { startDate: '2020-01-01', endDate: null };
const rate = (
  monthlyAmount: number,
  startDate = '2020-01-01'
): SalaryRateLike => ({
  monthlyAmount,
  startDate,
});

describe('splitAmount (arrondi FCFA)', () => {
  it('retombe toujours exactement sur le total', () => {
    expect(splitAmount(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitAmount(30_000, [1, 1])).toEqual([15_000, 15_000]);
    expect(splitAmount(1, [1, 1, 1])).toEqual([1, 0, 0]);
    for (const total of [100_000, 99_999, 7, 1_234_567]) {
      const parts = splitAmount(total, [3, 1, 4, 1, 5]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('répartit également quand les poids sont nuls', () => {
    expect(splitAmount(10, [0, 0, 0])).toEqual([4, 3, 3]);
  });
});

describe('mois', () => {
  it('avance d’un mois et franchit l’année', () => {
    expect(nextMonth('2026-06')).toBe('2026-07');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('liste les mois d’une plage', () => {
    expect(monthRange('2026-06', '2026-08')).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });
});

describe('salaire dû du mois', () => {
  it('mois complet : le dû retombe exactement sur le taux (mois de 31 jours)', () => {
    const all31 = salaryDueForMonth(employee, [rate(100_000)], '2026-07');
    expect(all31.due).toBe(100_000);
    expect(all31.daysEmployed).toBe(31);
    expect(all31.segments).toHaveLength(1);
  });

  it('changement de taux le 15 : dû proratisé au jour calendaire', () => {
    const rates = [rate(300_000, '2020-01-01'), rate(600_000, '2026-06-15')];
    const due = salaryDueForMonth(employee, rates, '2026-06');
    // 14 jours à 10 000 + 16 jours à 20 000 = 460 000.
    expect(due.due).toBe(460_000);
    expect(due.segments).toEqual([
      {
        rateStartDate: '2020-01-01',
        monthlyAmount: 300_000,
        days: 14,
        amount: 140_000,
      },
      {
        rateStartDate: '2026-06-15',
        monthlyAmount: 600_000,
        days: 16,
        amount: 320_000,
      },
    ]);
  });

  it('entrée en cours de mois : seuls les jours travaillés sont dus', () => {
    const entered: EmployeeLike = { startDate: '2026-06-10', endDate: null };
    const due = salaryDueForMonth(entered, [rate(300_000)], '2026-06');
    // Du 10 au 30 = 21 jours × 10 000.
    expect(due.due).toBe(210_000);
    expect(due.daysEmployed).toBe(21);
  });

  it('prorata exact : 300 000 FCFA, mois de 30 jours, 21 jours = 210 000', () => {
    const employee21: EmployeeLike = {
      startDate: '2026-06-10',
      endDate: '2026-06-30',
    };
    const due = salaryDueForMonth(employee21, [rate(300_000)], '2026-06');
    expect(due.daysEmployed).toBe(21);
    expect(due.due).toBe(210_000);
    expect(due.segments).toEqual([
      {
        rateStartDate: '2020-01-01',
        monthlyAmount: 300_000,
        days: 21,
        amount: 210_000,
      },
    ]);
  });

  it('arrondi par plus fort reste : mois de 31 jours non divisible', () => {
    const employee21: EmployeeLike = {
      startDate: '2026-07-01',
      endDate: '2026-07-21',
    };
    const due = salaryDueForMonth(employee21, [rate(100_000)], '2026-07');
    // 100 000 × 21 / 31 = 67 741,935… → 67 742 (FCFA entier).
    expect(due.due).toBe(67_742);
    expect(due.segments[0].amount).toBe(67_742);
  });

  it('mois sans taux : daysWithoutRate exposé, dû 0 pour ces jours', () => {
    // Le seul taux commence le 11 : les 10 premiers jours sont sans taux.
    const lateRate = [rate(300_000, '2026-06-11')];
    const due = salaryDueForMonth(employee, lateRate, '2026-06');
    expect(due.daysEmployed).toBe(30);
    expect(due.daysWithoutRate).toBe(10);
    // 20 jours couverts : 300 000 × 20 / 30 = 200 000.
    expect(due.due).toBe(200_000);
  });

  it('sortie en cours de mois : seuls les jours travaillés sont dus', () => {
    const left: EmployeeLike = {
      startDate: '2020-01-01',
      endDate: '2026-06-20',
    };
    const due = salaryDueForMonth(left, [rate(300_000)], '2026-06');
    // Du 1 au 20 = 20 jours × 10 000.
    expect(due.due).toBe(200_000);
  });

  it('entré le 10 / sorti le 20 : dû proratisé sur 11 jours', () => {
    const window: EmployeeLike = {
      startDate: '2026-06-10',
      endDate: '2026-06-20',
    };
    const due = salaryDueForMonth(window, [rate(300_000)], '2026-06');
    expect(due.due).toBe(110_000);
    expect(due.daysEmployed).toBe(11);
  });

  it('hors période d’emploi : rien n’est dû', () => {
    const later: EmployeeLike = { startDate: '2026-09-01', endDate: null };
    expect(salaryDueForMonth(later, [rate(300_000)], '2026-06').due).toBe(0);
  });
});

describe('reste à payer et versements', () => {
  it('trois versements dans le mois : reste à payer correct', () => {
    const payments: SalaryPaymentLike[] = [
      { month: '2026-06', type: 'SALAIRE', amount: 120_000 },
      { month: '2026-06', type: 'SALAIRE', amount: 80_000 },
      { month: '2026-06', type: 'ACOMPTE', amount: 50_000 },
    ];
    const s = summarizeSalaryMonth({
      employee,
      rates: [rate(300_000)],
      payments,
      month: '2026-06',
    });
    expect(s.due).toBe(300_000);
    expect(s.salariesPaid).toBe(200_000);
    expect(s.advancesPaid).toBe(50_000);
    expect(s.remainingToPay).toBe(50_000);
    expect(s.overpaid).toBe(0);
  });

  it('trop-perçu : overpaid exposé, reste à payer borné à 0', () => {
    const payments: SalaryPaymentLike[] = [
      { month: '2026-06', type: 'SALAIRE', amount: 250_000 },
      { month: '2026-06', type: 'ACOMPTE', amount: 80_000 },
    ];
    const s = summarizeSalaryMonth({
      employee,
      rates: [rate(300_000)],
      payments,
      month: '2026-06',
    });
    expect(s.due).toBe(300_000);
    expect(s.remainingToPay).toBe(0);
    expect(s.overpaid).toBe(30_000);
  });
});

describe('avances', () => {
  it('échéancier par défaut : récupérée en totalité le mois suivant', () => {
    expect(
      advanceRecoverySchedule({ month: '2026-06', amount: 30_000 })
    ).toEqual([{ month: '2026-07', amount: 30_000 }]);
  });

  it('échéancier étalé sur deux mois', () => {
    expect(
      advanceRecoverySchedule({
        month: '2026-06',
        amount: 30_000,
        recoveryMonths: 2,
      })
    ).toEqual([
      { month: '2026-07', amount: 15_000 },
      { month: '2026-08', amount: 15_000 },
    ]);
  });

  it('avance de 30 000 remboursée en deux fois : solde suivi mois par mois', () => {
    const payments: SalaryPaymentLike[] = [
      { month: '2026-06', type: 'AVANCE', amount: 30_000, recoveryMonths: 2 },
    ];
    const ledger = salaryLedger({
      employee,
      rates: [rate(300_000)],
      payments,
      months: monthRange('2026-06', '2026-08'),
    });

    // Juin : avance versée, rien à récupérer le mois même.
    expect(ledger[0]).toMatchObject({
      month: '2026-06',
      advanceGiven: 30_000,
      advanceRecovered: 0,
      advanceBalance: 30_000,
      remainingToPay: 300_000,
    });
    // Juillet : première moitié récupérée.
    expect(ledger[1]).toMatchObject({
      month: '2026-07',
      advanceRecovered: 15_000,
      advanceBalance: 15_000,
      remainingToPay: 285_000,
    });
    // Août : solde soldé.
    expect(ledger[2]).toMatchObject({
      month: '2026-08',
      advanceRecovered: 15_000,
      advanceBalance: 0,
      remainingToPay: 285_000,
    });
  });

  it('avance par défaut : récupérée le mois suivant en une fois', () => {
    const payments: SalaryPaymentLike[] = [
      { month: '2026-06', type: 'AVANCE', amount: 30_000 },
    ];
    const ledger = salaryLedger({
      employee,
      rates: [rate(300_000)],
      payments,
      months: monthRange('2026-06', '2026-07'),
    });
    expect(ledger[1].advanceRecovered).toBe(30_000);
    expect(ledger[1].advanceBalance).toBe(0);
  });

  it('le reliquat non absorbé un mois est reporté au mois suivant', () => {
    // Dû faible en juillet : l'avance ne peut être reprise qu'en partie.
    const payments: SalaryPaymentLike[] = [
      { month: '2026-06', type: 'AVANCE', amount: 30_000 },
    ];
    const rates = [rate(300_000, '2020-01-01'), rate(10_000, '2026-07-01')];
    const ledger = salaryLedger({
      employee,
      rates,
      payments,
      months: monthRange('2026-06', '2026-08'),
    });
    // Juillet : dû 10 000, l'avance est récupérée à hauteur de 10 000 seulement.
    expect(ledger[1]).toMatchObject({
      month: '2026-07',
      due: 10_000,
      advanceRecovered: 10_000,
      advanceBalance: 20_000,
      remainingToPay: 0,
    });
    // Août : le reliquat est repris.
    expect(ledger[2]).toMatchObject({
      month: '2026-08',
      advanceRecovered: 10_000,
      advanceBalance: 10_000,
    });
  });
});
