// Fiche employé 360° en lecture (#440/#442). Présentation pure : chaque bloc
// est alimenté par `getEmployee360`, qui rejoue le ledger unique de
// `lib/salaries`. Ordre voulu par fréquence d'usage :
// Synthèse → Derniers versements → Rémunération → Dettes et avances → Identité.
// Mobile d'abord : une colonne, aucune grille qui déborde à 390 px.

import { monthLabel } from '@/lib/fixed-costs/month';
import type { Employee360 } from '@/lib/employees/queries';
import { SalarySummaryBand } from '../../_components/salary-summary';
import { CompensationSection } from './sections/compensation-section';
import { DebtsSection } from './sections/debts-section';
import { IdentitySection } from './sections/identity-section';
import { MonthSection } from './sections/month-section';
import { PaymentsSection } from './sections/payments-section';

export function EmployeeDetail({ employee }: { employee: Employee360 }) {
  return (
    <div className="space-y-6">
      <SalarySummaryBand
        employee={employee}
        monthLabel={monthLabel(employee.month.month)}
        values={{
          due: employee.month.due,
          paid:
            employee.month.salariesPaid +
            employee.month.advancesPaid +
            employee.month.advanceRecovered,
          remainingToPay: employee.month.remainingToPay,
          arrearsTotal: employee.arrears.total,
          advanceBalance: employee.advanceBalance,
        }}
      />
      <MonthSection employee={employee} />
      <PaymentsSection employee={employee} />
      <CompensationSection employee={employee} />
      <DebtsSection employee={employee} />
      <IdentitySection employee={employee} />
    </div>
  );
}