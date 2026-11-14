// lib/employees/queries.ts — lectures de la page Employés (#440).
//
// Garde ADMIN + COMPTABLE (`requirePayroll`) sur CHAQUE lecture exportée : un
// MANAGER ou un ANALYSTE qui atteindrait l'URL directement n'obtient ni page
// ni donnée. Aucun calcul de paie ici : le ledger, l'arriéré et la proposition
// de paiement viennent de `lib/salaries` (`salaryStateThrough`,
// `salaryPaymentProposal`). Aucun nom ni montant n'est journalisé.

import prisma from '@/lib/prisma';
import { requirePayroll } from '@/lib/auth-helpers';
import {
  getSalaryMonthView,
  salaryStateThrough,
} from '@/lib/salaries/admin-queries';
import { listSalaryEmployees } from '@/lib/salaries/admin-lists';
import { salaryPaymentProposal } from '@/lib/salaries/arrears';
import { toSalaryRateLike } from '@/lib/salaries/mappers';
import { formatLocalDateOnly, todayDateString } from '@/lib/timezone';
import type { SalaryPaymentType } from '@/generated/prisma/enums';
import type { SalaryArrears, SalaryMonthSummary } from '@/lib/salaries/types';

export type EmployeeListRow = {
  id: string;
  name: string;
  position: string | null;
  active: boolean;
  startDate: string;
  endDate: string | null;
  /** Taux en vigueur aujourd'hui (dernier taux commencé), ou null. */
  currentRate: number | null;
  /** Situation du mois : dû, versé (salaires + acomptes + avances récupérées), reste. */
  month: {
    due: number;
    salariesPaid: number;
    advancesPaid: number;
    advanceRecovered: number;
    /** Encaissé pour ce mois : salaires + acomptes + avances récupérées. */
    paid: number;
    remainingToPay: number;
  };
  arrearsTotal: number;
};

export type EmployeesOverview = {
  month: string;
  employees: EmployeeListRow[];
};

export type Employee360Rate = { monthlyAmount: number; startDate: string };

export type Employee360Payment = {
  id: string;
  date: string;
  month: string;
  type: SalaryPaymentType;
  amount: number;
  note: string | null;
};

export type Employee360 = {
  id: string;
  name: string;
  position: string | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  note: string | null;
  /** Historique des taux, du plus récent au plus ancien. */
  rates: Employee360Rate[];
  currentRate: number | null;
  month: SalaryMonthSummary;
  arrears: SalaryArrears;
  advanceBalance: number;
  proposedPayment: {
    total: number;
    allocations: { month: string; amount: number }[];
  };
  /** Derniers versements (annulés compris : l'historique n'est jamais effacé). */
  payments: Employee360Payment[];
};

/** Dernier taux commencé à `today` (jamais un taux futur). */
function currentRateOf(
  rates: { monthlyAmount: number; startDate: string }[],
  today: string
): number | null {
  return rates.find((r) => r.startDate <= today)?.monthlyAmount ?? null;
}

/**
 * Liste des employés avec identité, taux en vigueur et situation du mois.
 * Réutilise les lectures existantes (aucune règle dupliquée) en les joignant
 * par `employeeId` : actifs d'abord, puis sortis.
 */
export async function listEmployeesOverview(
  month: string = todayDateString().slice(0, 7)
): Promise<EmployeesOverview> {
  await requirePayroll();
  const [view, employees] = await Promise.all([
    getSalaryMonthView(month),
    listSalaryEmployees(month),
  ]);
  const today = todayDateString();
  const rowsById = new Map(view.employees.map((r) => [r.employeeId, r]));

  const rows: EmployeeListRow[] = employees.map((e) => {
    const r = rowsById.get(e.id);
    const salariesPaid = r?.salariesPaid ?? 0;
    const advancesPaid = r?.advancesPaid ?? 0;
    const advanceRecovered = r?.advanceRecovered ?? 0;
    return {
      id: e.id,
      name: e.name,
      position: e.position,
      active: e.active,
      startDate: e.startDate,
      endDate: e.endDate,
      currentRate: currentRateOf(e.rates, today),
      month: {
        due: r?.due ?? 0,
        salariesPaid,
        advancesPaid,
        advanceRecovered,
        paid: salariesPaid + advancesPaid + advanceRecovered,
        remainingToPay: r?.remainingToPay ?? 0,
      },
      arrearsTotal: e.arrears.total,
    };
  });
  return { month, employees: rows };
}

/** Nombre de versements affichés sur la fiche 360°. */
const RECENT_PAYMENTS_LIMIT = 8;

/**
 * Fiche 360° d'un employé en lecture : identité, taux (en vigueur +
 * historique), situation du mois, arriéré, solde d'avance, derniers
 * versements. `null` si l'employé n'existe pas. Le ledger est rejoué par la
 * source unique (`salaryStateThrough`).
 */
export async function getEmployee360(
  employeeId: string,
  month: string = todayDateString().slice(0, 7)
): Promise<Employee360 | null> {
  await requirePayroll();
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
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
          id: true,
          date: true,
          month: true,
          type: true,
          amount: true,
          note: true,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
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
  if (!employee) return null;

  const { summary, arrears } = salaryStateThrough(
    employee,
    employee.rates,
    employee.payments,
    employee.adjustments,
    month
  );
  const today = todayDateString();
  const rates = employee.rates.map(toSalaryRateLike);

  return {
    id: employee.id,
    name: employee.name,
    position: employee.position,
    startDate: formatLocalDateOnly(employee.startDate),
    endDate: employee.endDate ? formatLocalDateOnly(employee.endDate) : null,
    active: employee.active,
    note: employee.note,
    rates,
    currentRate: currentRateOf(rates, today),
    month: summary,
    arrears,
    advanceBalance: summary.advanceBalance,
    proposedPayment: salaryPaymentProposal(summary, arrears),
    payments: employee.payments.slice(0, RECENT_PAYMENTS_LIMIT).map((p) => ({
      id: p.id,
      date: formatLocalDateOnly(p.date),
      month: p.month,
      type: p.type,
      amount: p.amount,
      note: p.note,
    })),
  };
}
