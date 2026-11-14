// lib/salaries/admin-queries.ts
//
// Lectures de l'écran admin Salaires. La logique de calcul vit dans `ledger.ts`
// et `arrears.ts` (pures) ; ici on ne fait que charger les données et
// l'appliquer. Rien de nominatif ne franchit `getMonthlySalaryTotal` (surface
// des rôles non-admin, `queries.ts`) : ces lectures-ci sont réservées à
// l'ADMIN.
//
// Aucune requête N+1 : employés, taux, versements et ajustements sont chargés
// en UNE requête par liste, le journal étant rejoué en mémoire.

import prisma from '@/lib/prisma';
import { salaryArrears, salaryPaymentProposal } from './arrears';
import { salaryLedgerThrough } from './ledger';
import { toEmployeeLike, toSalaryRateLike } from './mappers';
import type { SalaryAdjustmentNature } from '@/generated/prisma/enums';
import type {
  SalaryAdjustmentLike,
  SalaryArrears,
  SalaryMonthSummary,
  SalaryPaymentLike,
} from './types';

export type SalaryAdjustmentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  month: string;
  nature: SalaryAdjustmentNature;
  amount: number;
  note: string | null;
  canceledAt: string | null;
};

export type SalaryEmployeeMonthRow = SalaryMonthSummary & {
  employeeId: string;
  name: string;
  position: string | null;
  active: boolean;
  arrears: SalaryArrears;
  proposedPayment: {
    total: number;
    allocations: { month: string; amount: number }[];
  };
};

export type SalaryMonthTotals = {
  due: number;
  baseDue: number;
  primes: number;
  retenues: number;
  salariesPaid: number;
  advancesPaid: number;
  advanceRecovered: number;
  remainingToPay: number;
  overpaid: number;
  advanceBalance: number;
  arrearsTotal: number;
};

export type SalaryMonthView = {
  month: string;
  employees: SalaryEmployeeMonthRow[];
  totals: SalaryMonthTotals;
};

const EMPTY_TOTALS: SalaryMonthTotals = {
  due: 0,
  baseDue: 0,
  primes: 0,
  retenues: 0,
  salariesPaid: 0,
  advancesPaid: 0,
  advanceRecovered: 0,
  remainingToPay: 0,
  overpaid: 0,
  advanceBalance: 0,
  arrearsTotal: 0,
};

/**
 * Journal complet d'un employé jusqu'à `month`, plus son arriéré à cette date.
 * Exporté pour la fiche 360° (`lib/employees/queries.ts`) : une seule source
 * pour rejouer le ledger, jamais de recalcul parallèle.
 */
export function salaryStateThrough(
  employee: { startDate: Date; endDate: Date | null },
  rates: { monthlyAmount: number; startDate: Date }[],
  payments: SalaryPaymentLike[],
  adjustments: SalaryAdjustmentLike[],
  month: string
) {
  const ledger = salaryLedgerThrough({
    employee: toEmployeeLike(employee),
    rates: rates.map(toSalaryRateLike),
    payments,
    adjustments,
    month,
  });
  return {
    summary: ledger[ledger.length - 1],
    arrears: salaryArrears(ledger, month),
  };
}

/**
 * Vue d'un mois : pour chaque employé le dû, le versé (salaires + acomptes),
 * le reste à payer, l'arriéré et le solde d'avance, plus les totaux du mois.
 * Le journal complet est rejoué par employé (le solde d'avance dépend des mois
 * passés).
 */
export async function getSalaryMonthView(
  month: string
): Promise<SalaryMonthView> {
  const employees = await prisma.employee.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      position: true,
      active: true,
      startDate: true,
      endDate: true,
      rates: {
        select: { monthlyAmount: true, startDate: true },
        orderBy: { startDate: 'asc' },
      },
      payments: {
        select: {
          month: true,
          type: true,
          amount: true,
          recoveryMonths: true,
        },
      },
      adjustments: {
        select: {
          month: true,
          nature: true,
          amount: true,
          canceledAt: true,
        },
      },
    },
  });

  const rows: SalaryEmployeeMonthRow[] = employees.map((e) => {
    const { summary, arrears } = salaryStateThrough(
      e,
      e.rates,
      e.payments,
      e.adjustments,
      month
    );
    return {
      employeeId: e.id,
      name: e.name,
      position: e.position,
      active: e.active,
      arrears,
      proposedPayment: salaryPaymentProposal(summary, arrears),
      ...summary,
    };
  });

  const totals = rows.reduce<SalaryMonthTotals>(
    (acc, r) => ({
      due: acc.due + r.due,
      baseDue: acc.baseDue + r.baseDue,
      primes: acc.primes + r.primes,
      retenues: acc.retenues + r.retenues,
      salariesPaid: acc.salariesPaid + r.salariesPaid,
      advancesPaid: acc.advancesPaid + r.advancesPaid,
      advanceRecovered: acc.advanceRecovered + r.advanceRecovered,
      remainingToPay: acc.remainingToPay + r.remainingToPay,
      overpaid: acc.overpaid + r.overpaid,
      advanceBalance: acc.advanceBalance + r.advanceBalance,
      arrearsTotal: acc.arrearsTotal + r.arrears.total,
    }),
    { ...EMPTY_TOTALS }
  );

  return { month, employees: rows, totals };
}
