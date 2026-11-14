// Liste des employés (#440) : actifs d'abord, sortis ensuite. Aucune requête,
// aucun calcul de règle ici : les chiffres viennent de `listEmployeesOverview`.
// Mobile d'abord : cartes empilées sous `md`, tableau au-delà.

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import type {
  EmployeeListRow,
  EmployeesOverview,
} from '@/lib/employees/queries';

function StatusBadges({ row }: { row: EmployeeListRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {row.active ? (
        <Badge variant="outline">En poste</Badge>
      ) : (
        <Badge variant="secondary">Sorti</Badge>
      )}
      {row.month.remainingToPay > 0 ? (
        <Badge variant="secondary">Mois non soldé</Badge>
      ) : (
        <Badge variant="outline">Soldé</Badge>
      )}
      {row.arrearsTotal > 0 && (
        <Badge variant="destructive">Arriéré {money(row.arrearsTotal)}</Badge>
      )}
    </span>
  );
}

function EmployeeCard({ row }: { row: EmployeeListRow }) {
  return (
    <li>
      <Link
        href={`/dashboard/employes/${row.id}`}
        className="block min-h-11 rounded-lg border p-3 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.position || 'Poste non renseigné'}
            </p>
          </div>
          <StatusBadges row={row} />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Taux</dt>
          <dd className="text-right">
            {row.currentRate === null
              ? 'Aucun taux'
              : `${money(row.currentRate)} / mois`}
          </dd>
          <dt className="text-muted-foreground">Dû</dt>
          <dd className="text-right">{money(row.month.due)}</dd>
          <dt className="text-muted-foreground">Versé</dt>
          <dd className="text-right">{money(row.month.paid)}</dd>
          <dt className="text-muted-foreground">Reste</dt>
          <dd className="text-right font-semibold">
            {money(row.month.remainingToPay)}
          </dd>
        </dl>
      </Link>
    </li>
  );
}

function Group({ label, rows }: { label: string; rows: EmployeeListRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <ul className="grid gap-2 md:hidden">
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
                  <Link
                    href={`/dashboard/employes/${row.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {row.position || 'Poste non renseigné'}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadges row={row} />
                </TableCell>
                <TableCell className="text-right">
                  {row.currentRate === null
                    ? 'Aucun taux'
                    : money(row.currentRate)}
                </TableCell>
                <TableCell className="text-right">
                  {money(row.month.due)}
                </TableCell>
                <TableCell className="text-right">
                  {money(row.month.paid)}
                </TableCell>
                <TableCell className="text-right font-semibold">
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

export function EmployeesList({ overview }: { overview: EmployeesOverview }) {
  const active = overview.employees.filter((e) => e.active);
  const inactive = overview.employees.filter((e) => !e.active);

  if (overview.employees.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Aucun employé enregistré pour le moment.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Situation de {monthLabel(overview.month)}.
      </p>
      <Group label="En poste" rows={active} />
      <Group label="Sortis" rows={inactive} />
    </div>
  );
}
