// lib/salaries/admin-queries.ts
//
// Lectures de l'écran admin Salaires. La logique de calcul vit dans `ledger.ts`
// (pure) ; ici on ne fait que charger les données et l'appliquer. Rien de
// nominatif ne franchit `getMonthlySalaryTotal` (surface des rôles non-admin,
// `queries.ts`) : ces lectures-ci sont réservées à l'ADMIN.

import type { SalaryAdjustmentNature } from '@/generated/prisma/enums';
import prisma from '@/lib/prisma';
import { formatLocalDateOnly } from '@/lib/timezone';
import { summarizeSalaryMonth } from './ledger';
import { toEmployeeLike, toSalaryRateLike } from './mappers';
import type { SalaryMonthSummary } from './types';

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
};

/**
 * Vue d'un mois : pour chaque employé le dû (taux + primes − retenues), le
 * versé (salaires + acomptes), le reste à payer et le solde d'avance, plus les
 * totaux du mois. Le journal complet est rejoué par employé (le solde
 * d'avance dépend des mois passés).
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
    const summary = summarizeSalaryMonth({
      employee: toEmployeeLike(e),
      rates: e.rates.map(toSalaryRateLike),
      payments: e.payments,
      adjustments: e.adjustments,
      month,
    });
    return {
      employeeId: e.id,
      name: e.name,
      position: e.position,
      active: e.active,
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
    }),
    { ...EMPTY_TOTALS }
  );

  return { month, employees: rows, totals };
}

export type SalaryEmployeeRow = {
  id: string;
  name: string;
  position: string | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  note: string | null;
  rates: { monthlyAmount: number; startDate: string }[];
  /** Primes et retenues, annulées comprises (historique jamais supprimé). */
  adjustments: SalaryAdjustmentRow[];
};

/** Liste des employés, avec l'historique de leurs taux et de leurs ajustements. */
export async function listSalaryEmployees(): Promise<SalaryEmployeeRow[]> {
  const employees = await prisma.employee.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      position: true,
      startDate: true,
      endDate: true,
      active: true,
      note: true,
      rates: {
        select: { monthlyAmount: true, startDate: true },
        orderBy: { startDate: 'desc' },
      },
      adjustments: {
        select: {
          id: true,
          month: true,
          date: true,
          nature: true,
          amount: true,
          note: true,
          canceledAt: true,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });
  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    position: e.position,
    startDate: formatLocalDateOnly(e.startDate),
    endDate: e.endDate ? formatLocalDateOnly(e.endDate) : null,
    active: e.active,
    note: e.note,
    rates: e.rates.map(toSalaryRateLike),
    adjustments: e.adjustments.map((a) => ({
      id: a.id,
      employeeId: e.id,
      employeeName: e.name,
      date: formatLocalDateOnly(a.date),
      month: a.month,
      nature: a.nature,
      amount: a.amount,
      note: a.note,
      canceledAt: a.canceledAt ? formatLocalDateOnly(a.canceledAt) : null,
    })),
  }));
}

export type SalaryAdvanceRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  month: string;
  amount: number;
  recoveryMonths: number;
  note: string | null;
};

/** Avances enregistrées, les plus récentes d'abord (gestion admin). */
export async function listSalaryAdvances(): Promise<SalaryAdvanceRow[]> {
  const payments = await prisma.salaryPayment.findMany({
    where: { type: 'AVANCE' },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      employeeId: true,
      employee: { select: { name: true } },
      date: true,
      month: true,
      amount: true,
      recoveryMonths: true,
      note: true,
    },
  });
  return payments.map((p) => ({
    id: p.id,
    employeeId: p.employeeId,
    employeeName: p.employee.name,
    date: formatLocalDateOnly(p.date),
    month: p.month,
    amount: p.amount,
    recoveryMonths: p.recoveryMonths,
    note: p.note,
  }));
}
