'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StockBadge } from '@/components/(dashboard)/stock-badge';
import { useUndoToast } from '@/lib/hooks/use-undo-toast';
import { setOptionStockAction } from '../actions';

const SEARCH_DEBOUNCE_MS = 350;

export type OptionStockRowWithPending = {
  id: string;
  optionName: string;
  price: number;
  stockQuantity: number | null;
  groupName: string;
  isGlobal: boolean;
  productId: string | null;
  productName: string | null;
  categoryName: string | null;
  pending: number;
};

const priceFmt = new Intl.NumberFormat('fr-FR');

export function OptionsStockTable({
  rows,
}: {
  rows: OptionStockRowWithPending[];
}) {
  const searchParams = useSearchParams();
  // Recherche reflétée dans l'URL (`history.replaceState`, filtrage 100 %
  // client) : elle survit à un aller-retour et se partage par lien.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setDebouncedQuery(query),
      SEARCH_DEBOUNCE_MS
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    else params.delete('q');
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  }, [debouncedQuery]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.optionName.toLowerCase().includes(q) ||
        r.groupName.toLowerCase().includes(q) ||
        (r.productName ?? '').toLowerCase().includes(q)
    );
  }, [rows, debouncedQuery]);

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-[280px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un goût, un groupe, un produit…"
          className="h-9 pl-8 pr-8"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setQuery('')}
            aria-label="Effacer la recherche"
            className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="hidden md:table-cell">Produit</TableHead>
            <TableHead className="hidden lg:table-cell">Groupe</TableHead>
            <TableHead>Goût / option</TableHead>
            <TableHead className="hidden sm:table-cell">Prix</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead className="hidden sm:table-cell">En attente</TableHead>
            <TableHead className="text-right">Modifier</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="hidden font-medium md:table-cell">
                {r.isGlobal ? (
                  <Badge variant="secondary">Extra global</Badge>
                ) : (
                  <span>
                    {r.productName}
                    {r.categoryName && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({r.categoryName})
                      </span>
                    )}
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                {r.groupName}
              </TableCell>
              <TableCell>
                {r.optionName}
                {/* Le produit disparaît sous md : on le rappelle ici. */}
                <span className="block text-xs text-muted-foreground md:hidden">
                  {r.isGlobal ? 'Extra global' : r.productName}
                </span>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {priceFmt.format(r.price)} FCFA
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <StockBadge stockQuantity={r.stockQuantity} />
                  <Link
                    href={`/dashboard/menu/historique-stock?resource=${r.id}`}
                    className="inline-flex min-h-6 items-center px-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Historique
                  </Link>
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {r.pending > 0 ? (
                  <span
                    className="text-sm text-amber-700 dark:text-amber-400"
                    title="Quantité déjà demandée par des commandes non payées"
                  >
                    {r.pending}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <StockQuickEdit
                  optionId={r.id}
                  optionName={r.optionName}
                  stockQuantity={r.stockQuantity}
                />
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {rows.length === 0
                  ? 'Aucune option à stock suivi pour le moment.'
                  : 'Aucune option ne correspond à la recherche.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function StockQuickEdit({
  optionId,
  optionName,
  stockQuantity,
}: {
  optionId: string;
  optionName: string;
  stockQuantity: number | null;
}) {
  const { pushToast } = useUndoToast();
  const [value, setValue] = useState(String(stockQuantity ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError('Invalide');
      return;
    }
    startTransition(async () => {
      const result = await setOptionStockAction(optionId, quantity);
      if (!result.ok) {
        setError('Erreur');
        pushToast(result.error, 'error');
        return;
      }
      pushToast(`${optionName} : stock à ${quantity}`);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
        disabled={isPending}
        className="h-8 w-20 text-right"
        aria-label={`Stock de ${optionName}`}
      />
      <Button size="sm" variant="outline" disabled={isPending} onClick={save}>
        {isPending ? '…' : 'OK'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
