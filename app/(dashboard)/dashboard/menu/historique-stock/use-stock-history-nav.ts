'use client';

// Filtres de l'historique du stock, branchés sur l'URL via nuqs. Même patron
// que `commandes/use-orders-nav.ts` : une transition partagée par tous les
// contrôles, `shallow: false` (la page relit la base à chaque changement).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
} from 'react';
import { debounce, useQueryStates, type Values } from 'nuqs';
import { stockHistoryParsers } from './search-params';

export type StockHistoryFilters = Values<typeof stockHistoryParsers>;
export type StockHistoryPatch = {
  [K in keyof StockHistoryFilters]?: StockHistoryFilters[K] | null;
};

export type StockHistoryNav = {
  filters: StockHistoryFilters;
  /** Applique un patch ; repasse à la page 1. */
  update: (patch: StockHistoryPatch, options?: { debounceMs?: number }) => void;
  isPending: boolean;
};

const Context = createContext<StockHistoryNav | null>(null);

export function useStockHistoryNavValue(): StockHistoryNav {
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(stockHistoryParsers, {
    shallow: false,
    history: 'push',
    scroll: false,
    startTransition,
  });

  const update = useCallback<StockHistoryNav['update']>(
    (patch, options) => {
      void setFilters(
        { ...patch, page: null },
        options?.debounceMs
          ? { limitUrlUpdates: debounce(options.debounceMs) }
          : undefined
      );
    },
    [setFilters]
  );

  return useMemo(
    () => ({ filters, update, isPending }),
    [filters, update, isPending]
  );
}

export const StockHistoryNavProvider = Context.Provider;

export function useStockHistoryNav(): StockHistoryNav {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      'useStockHistoryNav doit être utilisé dans <HistoryToolbar>'
    );
  }
  return ctx;
}
