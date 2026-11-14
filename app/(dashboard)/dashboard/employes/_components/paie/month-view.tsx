// Vue du mois (#442) : dû, primes/retenues, versé, reste à payer, arriéré et
// solde d'avance par employé, plus les totaux du mois. Présentation pure
// (aucune requête, aucun calcul de règle) : les chiffres sont calculés côté
// serveur par `getSalaryMonthView`.
//
// Mobile d'abord : des cartes empilées sous `md`, un tableau dense au-delà.
// L'état (soldé / partiel / en retard) porte toujours un libellé et une icône.

import { money } from '@/lib/fixed-costs/format';
import type {
  SalaryEmployeeMonthRow,
  SalaryMonthView,
} from '@/lib/salaries/admin-queries';
import { settlementState } from '@/lib/employees/format';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmployeeAvatar } from '../employee-avatar';
import { SettlementBadge } from '../salary-summary';

function PayLine({ row }: { row: SalaryEmployeeMonthRow }) {
  return (
    <li className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <EmployeeAvatar name={row.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.position || 'Poste non renseigné'}
            {!row.active && ' · sorti'}
          </p>
        </div>
        <SettlementBadge
          state={settlementState({
            remainingToPay: row.remainingToPay,
            arrearsTotal: row.arrears.total,
          })}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-sm">
        <dt className="text-muted-foreground">Dû</dt>
        <dd className="text-right font-medium tabular-nums">
          {money(row.due)}
        </dd>
        <dt className="text-muted-foreground">Versé</dt>
        <dd className="text-right tabular-nums">
          {money(row.salariesPaid + row.advancesPaid + row.advanceRecovered)}
        </dd>
        <dt className="text-muted-foreground">Reste à payer</dt>
        <dd className="text-right font-semibold tabular-nums">
          {money(row.remainingToPay)}
        </dd>
        <dt className="text-muted-foreground">Arriéré</dt>
        <dd className="text-right tabular-nums">
          {money(row.arrears.total)}
        </dd>
        <dt className="text-muted-foreground">À payer (avec arriéré)</dt>
        <dd className="text-right font-semibold tabular-nums">
          {money(row.proposedPayment.total)}
        </dd>
        <dt className="text-muted-foreground">Solde d’avance</dt>
        <dd className="text-right tabular-nums">
          {money(row.advanceBalance)}
        </dd>
      </dl>
    </li>
  );
}

function TotalsMobile({ view }: { view: SalaryMonthView }) {
  const { totals } = view;
  return (
    <li className="rounded-lg border bg-muted/40 p-4 text-sm">
      <p className="font-medium">Total du mois</p>
      <dl className="mt-2 space-y-1">
        {[
          ['Dû', totals.due],
          ['Primes', totals.primes],
          ['Retenues', totals.retenues],
          [
            'Versé',
            totals.salariesPaid + totals.advancesPaid + totals.advanceRecovered,
          ],
          ['Reste à payer', totals.remainingToPay],
          ['Arriéré', totals.arrearsTotal],
          ['À payer (avec arriéré)', totals.remainingToPay + totals.arrearsTotal],
          ['Solde d’avance', totals.advanceBalance],
        ].map(([label, value]) => (
          <div key={label as string} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{money(value as number)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function AmountCell({
  value,
  strong = false,
}: {
  value: number;
  strong?: boolean;
}) {
  return (
    <TableCell
      className={`text-right tabular-nums ${strong ? 'font-semibold' : ''}`}
    >
      {money(value)}
    </TableCell>
  );
}

export function SalaryMonthView({ view }: { view: SalaryMonthView }) {
  const { employees, totals } = view;

  if (employees.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Aucun employé enregistré : crée un employé pour voir la paie du mois.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-3 md:hidden">
        {employees.map((row) => (
          <PayLine key={row.employeeId} row={row} />
        ))}
        <TotalsMobile view={view} />
      </ul>

      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="text-right">Dû</TableHead>
              <TableHead className="text-right">Primes</TableHead>
              <TableHead className="text-right">Retenues</TableHead>
              <TableHead className="text-right">Versé</TableHead>
              <TableHead className="text-right">Reste à payer</TableHead>
              <TableHead className="text-right">Arriéré</TableHead>
              <TableHead className="text-right">À payer</TableHead>
              <TableHead className="text-right">Solde d’avance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((row) => (
              <TableRow key={row.employeeId}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <EmployeeAvatar name={row.name} className="size-8" />
                    <div className="min-w-0">
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {row.position || 'Poste non renseigné'}
                        {!row.active && ' · sorti'}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <SettlementBadge
                    state={settlementState({
                      remainingToPay: row.remainingToPay,
                      arrearsTotal: row.arrears.total,
                    })}
                  />
                </TableCell>
                <AmountCell value={row.due} />
                <AmountCell value={row.primes} />
                <AmountCell value={row.retenues} />
                <AmountCell
                  value={
                    row.salariesPaid + row.advancesPaid + row.advanceRecovered
                  }
                />
                <AmountCell value={row.remainingToPay} strong />
                <AmountCell value={row.arrears.total} />
                <AmountCell value={row.proposedPayment.total} strong />
                <AmountCell value={row.advanceBalance} />
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell />
              <AmountCell value={totals.due} />
              <AmountCell value={totals.primes} />
              <AmountCell value={totals.retenues} />
              <AmountCell
                value={
                  totals.salariesPaid +
                  totals.advancesPaid +
                  totals.advanceRecovered
                }
              />
              <AmountCell value={totals.remainingToPay} strong />
              <AmountCell value={totals.arrearsTotal} />
              <AmountCell
                value={totals.remainingToPay + totals.arrearsTotal}
                strong
              />
              <AmountCell value={totals.advanceBalance} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}