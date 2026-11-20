// Rendu des écrans Employés (#450) : la règle dure « aucun champ de saisie sur
// une page de consultation » est vérifiée sur la liste, la fiche et la Paie du
// mois. Les formulaires vivent uniquement dans les tiroirs (montés à
// l'ouverture) ; la Paie du mois navigue par chevrons, pas par `<select>`.

import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import type { Employee360, EmployeeListRow } from '@/lib/employees/queries';
import type { SalaryMonthView as MonthView } from '@/lib/salaries/admin-queries';
import { EmployeeDetail } from '../[employeeId]/_components/employee-detail';
import { EmployeesList } from './employees-list';
import { SalaryMonthView } from './paie/month-view';

const noField = /<(input|select|textarea|form)[\s>]/i;

const row: EmployeeListRow = {
  id: 'e1',
  name: 'Awa Traoré',
  position: 'Barista',
  active: true,
  startDate: '2025-01-06',
  endDate: null,
  currentRate: 150_000,
  rates: [{ monthlyAmount: 150_000, startDate: '2025-01-06' }],
  note: null,
  month: {
    due: 150_000,
    salariesPaid: 60_000,
    advancesPaid: 0,
    advanceRecovered: 0,
    paid: 60_000,
    remainingToPay: 90_000,
  },
  arrearsTotal: 20_000,
};

const employee: Employee360 = {
  id: 'e1',
  name: 'Awa Traoré',
  position: 'Barista',
  startDate: '2025-01-06',
  endDate: null,
  active: true,
  note: null,
  rates: [{ monthlyAmount: 150_000, startDate: '2025-01-06' }],
  currentRate: 150_000,
  month: {
    month: '2026-11',
    baseDue: 150_000,
    primes: 10_000,
    retenues: 0,
    due: 160_000,
    salariesPaid: 60_000,
    advancesPaid: 0,
    advanceGiven: 0,
    advanceRecovered: 0,
    remainingToPay: 100_000,
    overpaid: 0,
    advanceBalance: 0,
  },
  arrears: {
    total: 0,
    months: [],
    oldestMonth: null,
  },
  advanceBalance: 0,
  proposedPayment: { total: 100_000, allocations: [] },
  payments: [],
};

const monthView: MonthView = {
  month: '2026-11',
  employees: [
    {
      ...employee.month,
      employeeId: 'e1',
      name: 'Awa Traoré',
      position: 'Barista',
      active: true,
      arrears: employee.arrears,
      proposedPayment: employee.proposedPayment,
    },
  ],
  totals: {
    due: 160_000,
    baseDue: 150_000,
    primes: 10_000,
    retenues: 0,
    salariesPaid: 60_000,
    advancesPaid: 0,
    advanceRecovered: 0,
    remainingToPay: 100_000,
    overpaid: 0,
    advanceBalance: 0,
    arrearsTotal: 0,
  },
};

describe('écrans Employés : aucun champ de saisie au repos', () => {
  it('la liste ne rend que liens, boutons et résumés', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmployeesList, {
        overview: { month: '2026-11', employees: [row] },
        today: '2026-11-14',
        canWrite: true,
      })
    );
    expect(html).not.toMatch(noField);
  });

  it('la fiche ne rend aucun champ', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmployeeDetail, { employee })
    );
    expect(html).toContain('Awa Traoré');
    expect(html).toContain('Dettes et avances');
    expect(html).not.toMatch(noField);
  });

  it('la Paie du mois ne rend ni champ ni menu déroulant', () => {
    const html = renderToStaticMarkup(
      React.createElement(SalaryMonthView, { view: monthView })
    );
    expect(html).toContain('Awa Traoré');
    expect(html).not.toMatch(noField);
  });
});
