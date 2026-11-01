import { createLoader, type SearchParams } from 'nuqs/server';
import { parseDateOnlyToUTC } from '@/lib/timezone';
import { stockHistoryParsers } from './search-params';

export type StockHistorySearchParams = SearchParams;

const loadStockHistorySearchParams = createLoader(stockHistoryParsers);

const DAY_MS = 86_400_000;

/**
 * Contrairement aux commandes, pas de jour par défaut : un historique se lit
 * d'abord en entier, du plus récent au plus ancien. Une plage n'existe que si
 * l'utilisateur en choisit une (`from`/`to` valides, `range=all` l'annule).
 */
export function parseStockHistorySearchParams(
  params: StockHistorySearchParams
) {
  const raw = loadStockHistorySearchParams(params);
  const fromDate = parseDateOnlyToUTC(raw.from ?? undefined);
  const toDate = parseDateOnlyToUTC(raw.to ?? undefined);
  const hasRange = raw.range !== 'all' && Boolean(fromDate || toDate);
  const from = hasRange ? (fromDate ?? toDate) : undefined;
  const toInclusive = hasRange ? (toDate ?? fromDate) : undefined;
  return {
    page: Math.max(1, raw.page),
    reason: raw.reason ?? undefined,
    source: raw.source ?? undefined,
    search: raw.search?.trim() || undefined,
    resourceId: raw.resource?.trim() || undefined,
    orderId: raw.order?.trim() || undefined,
    isAll: !hasRange,
    fromStr: hasRange ? (raw.from ?? raw.to ?? '') : '',
    toStr: hasRange ? (raw.to ?? raw.from ?? '') : '',
    dateFrom: from,
    dateToExclusive: toInclusive
      ? new Date(toInclusive.getTime() + DAY_MS)
      : undefined,
  };
}
