// Vue du mois : dû, versé, reste à payer et solde d'avance par employé, plus
// les totaux du mois. Présentation pure (aucune requête) : les chiffres sont
// calculés côté serveur par `getSalaryMonthView`.
//
// Mobile d'abord : des cartes empilées sous `md`, un tableau dense au-delà.

import { money } from '@/lib/fixed-costs/format';
import type {
  SalaryEmployeeMonthRow,
  SalaryMonthView,
} from '@/lib/salaries/admin-queries';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

function PayLine({ row }: { row: SalaryEmployeeMonthRow }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {row.position || 'Poste non renseigné'}
            {!row.active && ' · sorti'}
          </p>
        </div>
        <Badge variant={row.remainingToPay > 0 ? 'secondary' : 'outline'}>
          {row.remainingToPay > 0 ? 'Reste à payer' : 'Soldé'}
        </Badge>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Dû</dt>
        <dd className="text-right font-medium">{money(row.due)}</dd>
        <dt className="text-muted-foreground">Versé</dt>
        <dd className="text-right">
          {money(row.salariesPaid + row.advancesPaid + row.advanceRecovered)}
        </dd>
        <dt className="text-muted-foreground">Reste à payer</dt>
        <dd className="text-right font-semibold">
          {money(row.remainingToPay)}
        </dd>
        <dt className="text-muted-foreground">Solde d’avance</dt>
        <dd className="text-right">{money(row.advanceBalance)}</dd>
      </dl>
    </div>
  );
}

export function SalaryMonthView({ view }: { view: SalaryMonthView }) {
  const { employees, totals } = view;

  if (employees.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Aucun employé enregistré : ajoute-en un ci-dessous pour voir le mois.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Mobile : cartes */}
      <div className="grid gap-3 md:hidden">
        {employees.map((r) => (
          <PayLine key={r.employeeId} row={r} />
        ))}
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Total du mois</p>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">Dû</span>
            <span>{money(totals.due)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Versé</span>
            <span>
              {money(
                totals.salariesPaid +
                  totals.advancesPaid +
                  totals.advanceRecovered
              )}
            </span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Reste à payer</span>
            <span>{money(totals.remainingToPay)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Solde d’avance</span>
            <span>{money(totals.advanceBalance)}</span>
          </div>
        </div>
      </div>

      {/* Bureau : tableau dense */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead className="text-right">Dû</TableHead>
              <TableHead className="text-right">Salaires</TableHead>
              <TableHead className="text-right">Acomptes</TableHead>
              <TableHead className="text-right">Avance récup.</TableHead>
              <TableHead className="text-right">Reste à payer</TableHead>
              <TableHead className="text-right">Solde d’avance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell>
                  <span className="font-medium">{r.name}</span>
                  {!r.active && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      sorti
                    </span>
                  )}
                  {r.position && (
                    <span className="block text-xs text-muted-foreground">
                      {r.position}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">{money(r.due)}</TableCell>
                <TableCell className="text-right">
                  {money(r.salariesPaid)}
                </TableCell>
                <TableCell className="text-right">
                  {money(r.advancesPaid)}
                </TableCell>
                <TableCell className="text-right">
                  {money(r.advanceRecovered)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {money(r.remainingToPay)}
                </TableCell>
                <TableCell className="text-right">
                  {money(r.advanceBalance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell className="text-right">{money(totals.due)}</TableCell>
              <TableCell className="text-right">
                {money(totals.salariesPaid)}
              </TableCell>
              <TableCell className="text-right">
                {money(totals.advancesPaid)}
              </TableCell>
              <TableCell className="text-right">
                {money(totals.advanceRecovered)}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {money(totals.remainingToPay)}
              </TableCell>
              <TableCell className="text-right">
                {money(totals.advanceBalance)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
