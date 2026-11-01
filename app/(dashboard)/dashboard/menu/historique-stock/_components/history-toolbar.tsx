'use client';

// Barre de filtres de l'historique du stock : plage de dates, motif, source,
// recherche par nom. Détient l'unique transition de navigation et la partage à
// tous les contrôles (cf. `commandes/orders-toolbar.tsx`).

import { Chip, Input, Select, SelectItem } from '@heroui/react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRangeFilter } from '@/components/(dashboard)/date-range-filter';
import { rangeChangeToParams } from '@/lib/url-state/shared-params';
import { STOCK_REASON_LABELS } from '@/lib/stock-history/types';
import { STOCK_REASONS, STOCK_SOURCES } from '../search-params';
import {
  StockHistoryNavProvider,
  useStockHistoryNavValue,
  type StockHistoryFilters,
} from '../use-stock-history-nav';

const SOURCE_LABELS = {
  STAFF: 'Équipe',
  MCP: 'Claude / assistant',
  SYSTEM: 'Automatique',
} as const;

const DEBOUNCE_MS = 350;

type Props = {
  from: string;
  to: string;
  isAll: boolean;
  /** Libellé de la ressource filtrée (clic sur un nom), pour la pastille. */
  resourceLabel?: string;
};

export function HistoryToolbar({ from, to, isAll, resourceLabel }: Props) {
  const nav = useStockHistoryNavValue();
  const { filters, update } = nav;

  return (
    <StockHistoryNavProvider value={nav}>
      <div
        aria-busy={nav.isPending}
        className={cn(
          'space-y-3 transition-opacity',
          nav.isPending && 'pointer-events-none opacity-60'
        )}
      >
        <DateRangeFilter
          from={from}
          to={to}
          isAll={isAll}
          allowAll
          onRangeChange={(next) => update(rangeChangeToParams(next))}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Rechercher un produit ou un goût"
            placeholder="Produit ou goût…"
            size="sm"
            variant="bordered"
            radius="md"
            isClearable
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={filters.search ?? ''}
            onValueChange={(v) =>
              update(
                { search: v.trim() ? v : null },
                { debounceMs: DEBOUNCE_MS }
              )
            }
            onClear={() => update({ search: null })}
            className="w-full sm:w-[260px]"
          />
          <Select
            aria-label="Filtrer par motif"
            placeholder="Tous les motifs"
            size="sm"
            variant="bordered"
            radius="md"
            selectedKeys={filters.reason ? [filters.reason] : []}
            onSelectionChange={(keys) => {
              if (keys === 'all') return;
              const next = Array.from(keys)[0];
              update({
                reason: (next as StockHistoryFilters['reason']) ?? null,
              });
            }}
            className="w-full sm:w-[260px]"
          >
            {STOCK_REASONS.map((r) => (
              <SelectItem key={r}>{STOCK_REASON_LABELS[r]}</SelectItem>
            ))}
          </Select>
          <Select
            aria-label="Filtrer par origine"
            placeholder="Toute origine"
            size="sm"
            variant="bordered"
            radius="md"
            selectedKeys={filters.source ? [filters.source] : []}
            onSelectionChange={(keys) => {
              if (keys === 'all') return;
              const next = Array.from(keys)[0];
              update({
                source: (next as StockHistoryFilters['source']) ?? null,
              });
            }}
            className="w-full sm:w-[180px]"
          >
            {STOCK_SOURCES.map((s) => (
              <SelectItem key={s}>{SOURCE_LABELS[s]}</SelectItem>
            ))}
          </Select>
        </div>

        {(filters.resource || filters.order) && (
          <div className="flex flex-wrap items-center gap-2">
            {filters.resource && (
              <Chip
                variant="flat"
                color="primary"
                onClose={() => update({ resource: null })}
              >
                {resourceLabel ?? 'Une ressource'}
              </Chip>
            )}
            {filters.order && (
              <Chip
                variant="flat"
                color="primary"
                onClose={() => update({ order: null })}
              >
                Une commande
              </Chip>
            )}
          </div>
        )}
      </div>
    </StockHistoryNavProvider>
  );
}
