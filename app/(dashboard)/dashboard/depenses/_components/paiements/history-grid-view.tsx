// Vue historique charge × mois (#454). Lecture seule : cliquer une case ouvre le
// mois dans l'onglet Paiements (ou le rapprochement). Mobile d'abord : cartes
// par charge sous `md` (pastilles de mois), table à colonne sticky au-delà.

import Link from 'next/link';
import { compactMoney, money } from '@/lib/fixed-costs/format';
import type {
  HistoryCell,
  HistoryGrid,
  HistoryRow,
} from '@/lib/fixed-costs/history-grid';
import { monthLabel } from '@/lib/fixed-costs/month';
import { cn } from '@/lib/utils';
import { HISTORY_CELL_META, historyCellHref } from './history-grid-meta';

const shortMonth = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

function CellContent({ cell }: { cell: HistoryCell }) {
  const meta = HISTORY_CELL_META[cell.state];
  if (cell.state === 'NA') return <span aria-label="Non applicable">—</span>;
  return (
    <>
      <span className="block text-[11px] font-medium leading-tight">
        {meta.label}
      </span>
      {cell.state === 'PARTIAL' && (
        <span className="block text-[11px] tabular-nums">
          reste {compactMoney(cell.remaining)}
        </span>
      )}
    </>
  );
}

function RowLabel({ row }: { row: HistoryRow }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-sm font-medium">{row.cost.label}</p>
      {row.cost.inactive && (
        <p className="text-xs text-muted-foreground">Charge désactivée</p>
      )}
    </div>
  );
}

function Totals({ row }: { row: HistoryRow }) {
  return (
    <p className="text-xs tabular-nums text-muted-foreground">
      Dû {money(row.due)} · payé {money(row.paid)} · reste{' '}
      {money(row.remaining)}
    </p>
  );
}

function UnpaidCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
      {count} impayé{count > 1 ? 's' : ''}
    </span>
  );
}

function CellLink({
  cell,
  className,
}: {
  cell: HistoryCell;
  className?: string;
}) {
  const meta = HISTORY_CELL_META[cell.state];
  const base = cn('rounded-md border px-1.5 py-1 text-center', meta.className);
  if (cell.state === 'NA')
    return (
      <div className={cn(base, className)}>
        <CellContent cell={cell} />
      </div>
    );
  return (
    <Link
      href={historyCellHref(cell.month, cell.state)}
      className={cn(base, 'block min-h-11 hover:opacity-80', className)}
      aria-label={`${monthLabel(cell.month)} : ${meta.label}`}
    >
      <CellContent cell={cell} />
    </Link>
  );
}

export function HistoryGridView({ grid }: { grid: HistoryGrid }) {
  if (grid.rows.length === 0)
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Aucune charge à afficher sur cette période.
      </p>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm tabular-nums text-muted-foreground">
        Total de la période : dû {money(grid.total.due)} · payé{' '}
        {money(grid.total.paid)} · reste {money(grid.total.remaining)}
      </p>

      <ul className="space-y-3 md:hidden">
        {grid.rows.map((row) => (
          <li
            key={row.cost.id}
            className={cn(
              'space-y-2 rounded-lg border p-3',
              row.cost.inactive && 'opacity-70'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <RowLabel row={row} />
              <UnpaidCount count={row.unpaidMonths} />
            </div>
            <Totals row={row} />
            <ul className="grid grid-cols-3 gap-1.5">
              {row.cells
                .filter((c) => c.state !== 'NA')
                .map((cell) => (
                  <li key={cell.month}>
                    <p className="mb-0.5 text-[11px] capitalize text-muted-foreground">
                      {shortMonth(cell.month)}
                    </p>
                    <CellLink cell={cell} />
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-background text-left text-xs font-medium text-muted-foreground">
                Charge
              </th>
              {grid.months.map((m) => (
                <th
                  key={m}
                  className="min-w-16 text-xs font-medium capitalize text-muted-foreground"
                >
                  {shortMonth(m)}
                </th>
              ))}
              <th className="text-right text-xs font-medium text-muted-foreground">
                Impayés
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground">
                Dû / payé / reste
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr
                key={row.cost.id}
                className={cn(row.cost.inactive && 'opacity-70')}
              >
                <th
                  scope="row"
                  className="sticky left-0 min-w-40 bg-background text-left font-normal"
                >
                  <RowLabel row={row} />
                </th>
                {row.cells.map((cell) => (
                  <td key={cell.month}>
                    <CellLink cell={cell} />
                  </td>
                ))}
                <td className="text-right tabular-nums">{row.unpaidMonths}</td>
                <td className="whitespace-nowrap text-right text-xs tabular-nums">
                  {compactMoney(row.due)} / {compactMoney(row.paid)} /{' '}
                  {compactMoney(row.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
