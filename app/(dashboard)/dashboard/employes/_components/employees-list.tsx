// Liste des employés (#440/#441/#442) : actifs d'abord, sortis ensuite. Aucune
// requête, aucun calcul de règle ici : les chiffres viennent de
// `listEmployeesOverview`. Mobile d'abord : cartes empilées sous `md`, tableau
// au-delà. Aucun champ de saisie : les actions ouvrent des tiroirs.

import { UsersRound } from 'lucide-react';
import { monthLabel } from '@/lib/fixed-costs/month';
import type {
  EmployeeListRow,
  EmployeesOverview,
} from '@/lib/employees/queries';
import { EmployeeListCard } from './employee-list-card';
import { EmployeeListTable } from './employee-list-table';
import { NewEmployeeButton } from './new-employee-button';

function Group({
  label,
  rows,
  today,
  month,
  canWrite,
}: {
  label: string;
  rows: EmployeeListRow[];
  today: string;
  month: string;
  canWrite: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <EmployeeListCard
            key={row.id}
            row={row}
            today={today}
            month={month}
            canWrite={canWrite}
          />
        ))}
      </ul>
      <div className="hidden md:block">
        <EmployeeListTable
          rows={rows}
          today={today}
          month={month}
          canWrite={canWrite}
        />
      </div>
    </section>
  );
}

function EmptyState({ today, canWrite }: { today: string; canWrite: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UsersRound className="size-6" aria-hidden="true" />
      </span>
      <div>
        <p className="font-medium">Aucun employé enregistré</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Crée le premier employé pour suivre ses taux et sa paie.
        </p>
      </div>
      {canWrite && <NewEmployeeButton today={today} label="Créer un employé" />}
    </div>
  );
}

export function EmployeesList({
  overview,
  today,
  canWrite,
}: {
  overview: EmployeesOverview;
  today: string;
  /** ADMIN uniquement : un COMPTABLE consulte sans action d'écriture. */
  canWrite: boolean;
}) {
  const active = overview.employees.filter((employee) => employee.active);
  const inactive = overview.employees.filter((employee) => !employee.active);

  if (overview.employees.length === 0) {
    return <EmptyState today={today} canWrite={canWrite} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Situation de {monthLabel(overview.month)}.
      </p>
      <Group
        label="En poste"
        rows={active}
        today={today}
        month={overview.month}
        canWrite={canWrite}
      />
      <Group
        label="Sortis"
        rows={inactive}
        today={today}
        month={overview.month}
        canWrite={canWrite}
      />
    </div>
  );
}
