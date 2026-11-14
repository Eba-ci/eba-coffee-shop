// Carte Employé (#442) : la version mobile de la liste. Le nom et la situation
// du mois restent lisibles d'un coup d'œil ; la carte entière est un lien vers
// la fiche, sans aucun champ de saisie.

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { EmployeeListRow } from '@/lib/employees/queries';
import { EmployeeAvatar } from './employee-avatar';
import { SalarySummaryCompact } from './salary-summary';
import { StatusBadges } from './status-badges';

export function EmployeeListCard({ row }: { row: EmployeeListRow }) {
  return (
    <li>
      <Link
        href={`/dashboard/employes/${row.id}`}
        className="flex min-h-11 items-start gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <EmployeeAvatar name={row.name} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.position || 'Poste non renseigné'}
                {row.currentRate === null
                  ? ' · aucun taux'
                  : ` · ${row.currentRate.toLocaleString('fr-FR')} F/mois`}
              </p>
            </div>
            <ChevronRight
              className="mt-1 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <StatusBadges row={row} />
          <SalarySummaryCompact
            values={{
              due: row.month.due,
              paid: row.month.paid,
              remainingToPay: row.month.remainingToPay,
              arrearsTotal: row.arrearsTotal,
              advanceBalance: 0,
            }}
          />
        </div>
      </Link>
    </li>
  );
}