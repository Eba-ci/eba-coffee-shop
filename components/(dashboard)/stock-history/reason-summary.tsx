// « Comment le stock bouge » : sorties et entrées cumulées par motif, sur la
// sélection courante (mêmes filtres que la liste, sans pagination).

import type { StockReasonSummary } from '@/lib/stock-history/queries';
import { STOCK_REASON_LABELS } from '@/lib/stock-history/types';

export function ReasonSummary({ rows }: { rows: StockReasonSummary[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Résumé par motif" className="space-y-2">
      <h2 className="text-sm font-semibold">Comment le stock bouge</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.reason} className="rounded-lg border p-3 text-sm">
            <div className="font-medium">{STOCK_REASON_LABELS[r.reason]}</div>
            <div className="mt-1 flex items-center gap-3 tabular-nums">
              {r.unitsOut > 0 && (
                <span className="font-semibold text-danger">−{r.unitsOut}</span>
              )}
              {r.unitsIn > 0 && (
                <span className="font-semibold text-success">+{r.unitsIn}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {r.movements} mouvement{r.movements > 1 ? 's' : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
