// Badges réunis d'une ligne Employé (#442) : emploi + état du mois + arriéré.
// Chaque badge porte libellé et icône (voir `employee-badges`).

import type { EmployeeListRow } from '@/lib/employees/queries';
import {
  ArrearsBadge,
  EmploymentBadge,
  MonthStateBadge,
} from './employee-badges';

export function StatusBadges({ row }: { row: EmployeeListRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <EmploymentBadge active={row.active} endDate={row.endDate} />
      <MonthStateBadge remainingToPay={row.month.remainingToPay} />
      <ArrearsBadge total={row.arrearsTotal} />
    </span>
  );
}
