// Tableau Employé (#442) : version bureau de la liste, plus dense mais toujours
// alignée. Les montants sont à droite en `tabular-nums` ; chaque ligne renvoie
// vers la fiche.

import Link from 'next/link';
import { money } from '@/lib/fixed-costs/format';
import type { EmployeeListRow } from '@/lib/employees/queries';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmployeeAvatar } from './employee-avatar';
import { StatusBadges } from './status-badges';

export function EmployeeListTable({ rows }: { rows: EmployeeListRow[] }) {
  return (
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
              {row.currentRate === null ? 'Aucun taux' : money(row.currentRate)}
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
  );
}