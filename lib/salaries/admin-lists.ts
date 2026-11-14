// lib/salaries/admin-lists.ts
//
// Lectures de listes de l'écran admin Salaires (employés avec taux, ajustements
// et arriéré ; avances). Le calcul vit dans `admin-queries.ts` / `ledger.ts` /
// `arrears.ts` ; ici on charge en UNE requête par liste, sans N+1.
// Réservé à l'ADMIN : rien de nominatif ne passe par `getMonthlySalaryTotal`.

import prisma from '@/lib/prisma';
import { formatLocalDateOnly, todayDateString } from '@/lib/timezone';
import { salaryStateThrough } from './admin-queries';
import { toSalaryRateLike } from './mappers';
import type { SalaryAdjustmentRow } from './admin-queries';
import type { SalaryArrears } from './types';

export type SalaryEmployeeRow = {
  id: string;
  name: string;
  position: string | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  note: string | null;
  rates: { monthlyAmount: number; startDate: string }[];
  /** Arriéré à `asOfMonth` (mois clôturés non soldés, mois courant exclu). */
  arrears: SalaryArrears;
  /** Primes et retenues, annulées comprises (historique jamais supprimé). */
  adjustments: SalaryAdjustmentRow[];
};

/**
 * Liste des employés avec l'historique de leurs taux, leurs ajustements et
 * leur arriéré à `asOfMonth` (défaut : mois courant). Tout est chargé en une
 * requête : aucun appel par employé.
 */
export async function listSalaryEmployees(
  asOfMonth: string = todayDateString().slice(0, 7)
): Promise<SalaryEmployeeRow[]> {
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
  return employees.map((e) => {
    const { arrears } = salaryStateThrough(
      e,
      e.rates,
      e.payments,
      e.adjustments,
      asOfMonth
    );
    return {
      id: e.id,
      name: e.name,
      position: e.position,
      startDate: formatLocalDateOnly(e.startDate),
      endDate: e.endDate ? formatLocalDateOnly(e.endDate) : null,
      active: e.active,
      note: e.note,
      rates: e.rates.map(toSalaryRateLike),
      arrears,
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
    };
  });
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
