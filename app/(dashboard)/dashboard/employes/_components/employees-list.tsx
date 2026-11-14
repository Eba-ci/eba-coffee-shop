// Liste des employés (#440/#441) : actifs d'abord, sortis ensuite. Aucune
// requête, aucun calcul de règle ici : les chiffres viennent de
// `listEmployeesOverview`. Mobile d'abord : cartes empilées sous `md`, tableau
// au-delà. Aucun champ de saisie : « Nouvel employé » ouvre un tiroir.

import Link from 'next/link';
import { UsersRound } from 'lucide-react';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  EmployeeListRow,
  EmployeesOverview,
} from '@/lib/employees/queries';
import {
  ArrearsBadge,
  EmploymentBadge,
  MonthStateBadge,
} from './employee-badges';
import { EmployeeAvatar } from './employee-avatar';
import { NewEmployeeButton } from './new-employee-button';

function StatusBadges({ row }: { row: EmployeeListRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <EmploymentBadge active={row.active} endDate={row.endDate} />
      <MonthStateBadge remainingToPay={row.month.remainingToPay} />
      <ArrearsBadge total={row.arrearsTotal} />
    </span>
  );
}

function Amount({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`text-right tabular-nums ${strong ? 'font-semibold' : ''}`}
      >
        {money(value)}
      </dd>
    </>
  );
}

function EmployeeCard({ row }: { row: EmployeeListRow }) {
  return (
    <li>
      <Link
        href={`/dashboard/employes/${row.id}`}
        className="block min-h-11 rounded-lg border p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex items-start gap-3">
          <EmployeeAvatar name={row.name} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.position || 'Poste non renseigné'}
            </p>
            <div className="mt-2">
              <StatusBadges row={row} />
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Taux</dt>
          <dd className="text-right tabular-nums">
            {row.currentRate === null
              ? 'Aucun taux'
              : `${money(row.currentRate)} / mois`}
          </dd>
          <Amount label="Dû" value={row.month.due} />
          <Amount label="Versé" value={row.month.paid} />
          <Amount label="Reste" value={row.month.remainingToPay} strong />
        </dl>
      </Link>
    </li>
  );
}

function Group({ label, rows }: { label: string; rows: EmployeeListRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <EmployeeCard key={row.id} row={row} />
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Taux / mois</TableHead>
              <TableHead className="text-right">Dû</TableHead>
              <TableHead className="text-right">Versé</TableHead>
              <TableHead className="text-right">Reste</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <EmployeeAvatar name={row.name} />
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/employes/${row.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {row.position || 'Poste non renseigné'}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadges row={row} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.currentRate === null
                    ? 'Aucun taux'
                    : money(row.currentRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.month.due)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.month.paid)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {money(row.month.remainingToPay)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function EmptyState({ today }: { today: string }) {
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
      <NewEmployeeButton today={today} label="Créer un employé" />
    </div>
  );
}

export function EmployeesList({
  overview,
  today,
}: {
  overview: EmployeesOverview;
  today: string;
}) {
  const active = overview.employees.filter((e) => e.active);
  const inactive = overview.employees.filter((e) => !e.active);

  if (overview.employees.length === 0) {
    return <EmptyState today={today} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Situation de {monthLabel(overview.month)}.
      </p>
      <Group label="En poste" rows={active} />
      <Group label="Sortis" rows={inactive} />
    </div>
  );
}
