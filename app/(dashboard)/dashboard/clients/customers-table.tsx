'use client';

// Tableau clients (TanStack Table, headless) au-dessus des primitives shadcn
// (`components/ui/table`, cf. politique UI — Table = shadcn). Le tri est
// BACKEND (`manualSorting`) : un clic sur un en-tête change `sort`/`dir` dans
// l'URL (nuqs, cf. `use-clients-nav.ts`), et la base trie/pagine sur l'ensemble des
// clients (`lib/customers/filter.ts`) — pas seulement la page affichée.

import { useMemo } from 'react';
import Link from 'next/link';
import {
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Handshake } from 'lucide-react';
import { formatPhoneForDisplay } from '@/lib/phone';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CustomerStats } from '@/lib/customers';
// Module pur : jamais le barrel `@/lib/customers` pour une VALEUR dans un composant
// client (il réexporte la lecture en base : le build de Next échoue).
import { viewDefaultSort } from '@/lib/customers/views';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CUSTOMER_SORT_KEYS } from './search-params';
import { useClientsNav } from './use-clients-nav';

const priceFmt = new Intl.NumberFormat('fr-FR');
const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export type CustomerRow = {
  id: string;
  name: string | null;
  phone: string;
  isTrusted: boolean;
  trustedNote: string | null;
  /** Chiffres du client, joints à la requête de la liste (cf. lib/customers/list.ts). */
  stats: CustomerStats | null;
};

const NO_STAT = <span className="text-muted-foreground">—</span>;

const columns: ColumnDef<CustomerRow>[] = [
  {
    id: 'name',
    header: 'Nom',
    cell: ({ row }) => (
      <Link
        href={`/dashboard/clients/${row.original.id}`}
        className="inline-block py-1.5 font-medium hover:underline"
      >
        {row.original.name ?? '—'}
      </Link>
    ),
  },
  {
    id: 'phone',
    header: 'Téléphone',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {formatPhoneForDisplay(row.original.phone)}
      </span>
    ),
  },
  {
    id: 'trusted',
    header: 'Confiance',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.isTrusted ? (
        <Badge
          className="bg-blue-600"
          title={row.original.trustedNote ?? undefined}
        >
          <Handshake className="h-3 w-3" aria-hidden="true" />
          Confiance
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: 'ordersCount',
    header: 'Commandes',
    cell: ({ row }) => {
      const s = row.original.stats;
      return s ? (
        <span className="tabular-nums">{s.ordersCount}</span>
      ) : (
        NO_STAT
      );
    },
  },
  {
    id: 'totalSpent',
    header: 'Total acheté',
    cell: ({ row }) => {
      const s = row.original.stats;
      return s ? (
        <span className="tabular-nums">{priceFmt.format(s.totalSpent)} F</span>
      ) : (
        NO_STAT
      );
    },
  },
  {
    id: 'lastOrderAt',
    header: 'Dernière commande',
    cell: ({ row }) => {
      const s = row.original.stats;
      return s ? (
        <span className="text-sm text-muted-foreground">
          {s.lastOrderAt ? dateFmt.format(s.lastOrderAt) : '—'}
        </span>
      ) : (
        NO_STAT
      );
    },
  },
];

// Seules ces colonnes correspondent à un `CustomerSortKey` que le serveur
// sait trier (cf. lib/customers.ts) ; les autres restent `enableSorting: false`.
const SORTABLE = new Set<string>(CUSTOMER_SORT_KEYS);

const RANK_COLUMN: ColumnDef<CustomerRow> = {
  id: 'rank',
  header: '#',
  enableSorting: false,
  // Rang = position dans la liste triée (page courante comprise) : voir `rankFrom`.
  cell: ({ row, table }) => (
    <span className="tabular-nums text-muted-foreground">
      {(table.options.meta as { rankFrom: number }).rankFrom + row.index}
    </span>
  ),
};

export function CustomersTable({
  customers,
  rankFrom,
}: {
  customers: CustomerRow[];
  /** Rang du premier client affiché ; absent = pas de colonne « # ». */
  rankFrom?: number;
}) {
  const { filters, update, isPending } = useClientsNav();
  const { dir, search } = filters;
  // Une vue trie d'office (ex. « Meilleurs » → total acheté) tant qu'on n'a pas cliqué un en-tête.
  const sort = filters.sort ?? viewDefaultSort(filters.vue);
  const tableColumns = useMemo(
    () => (rankFrom ? [RANK_COLUMN, ...columns] : columns),
    [rankFrom]
  );

  const sorting: SortingState = sort
    ? [{ id: sort, desc: dir === 'desc' }]
    : [];

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    const first = next[0];
    update(
      first
        ? { sort: first.id as typeof sort, dir: first.desc ? 'desc' : 'asc' }
        : { sort: null, dir: null }
    );
  };

  const table = useReactTable({
    data: customers,
    columns: tableColumns,
    meta: { rankFrom: rankFrom ?? 1 },
    state: { sorting },
    onSortingChange: handleSortingChange,
    manualSorting: true,
    // Pagination faite par le serveur (cf. `Pagination`, nuqs). SANS ce réglage,
    // TanStack réinitialise la page à chaque changement de `data` ; avec un
    // `data` recréé à chaque rendu et un re-rendu (arrivée de données, état de
    // navigation…), cela relançait un rendu en boucle : onglet figé, aucune
    // erreur en console (mesuré : 1 170 rendus en 5 s contre 22).
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'overflow-x-auto transition-opacity',
        isPending && 'opacity-60'
      )}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortable = SORTABLE.has(header.column.id);
                const sortState = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex min-h-9 items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {sortState === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : sortState === 'desc' ? (
                          <ArrowDown
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <ArrowUpDown
                            className="h-3.5 w-3.5 text-muted-foreground/50"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {customers.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-muted-foreground"
              >
                {search
                  ? 'Aucun client pour cette recherche.'
                  : 'Aucun client à afficher.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
