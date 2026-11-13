'use client';

// Liste d'échéances de charges fixes avec leur statut, l'action « Enregistrer
// le paiement » (drawer prérempli) et, en option, un mode sélection pour
// régler plusieurs échéances d'un coup.

import { Button } from '@/components/ui/button';
import type { Occurrence, OccurrenceStatus } from '@/lib/fixed-costs/schedule';
import { formatDay } from '@/lib/fixed-costs/format';
import { cn } from '@/lib/utils';
import { OCCURRENCE_STATUS_META, money } from './status';
import { usePayOccurrence } from './pay-drawer';
import { BatchBar } from './batch-bar';
import { occKey, useBatchSelection } from './use-batch-selection';

export function OccurrenceStatusBadge({
  status,
}: {
  status: OccurrenceStatus;
}) {
  const meta = OCCURRENCE_STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        meta.badge
      )}
    >
      <meta.Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </span>
  );
}

export function OccurrenceRow({
  occurrence,
  showDay,
  readOnly = false,
  selection,
}: {
  occurrence: Occurrence;
  showDay: boolean;
  readOnly?: boolean;
  /** Défini = mode sélection : case à cocher au lieu du bouton de paiement. */
  selection?: { checked: boolean; disabled: boolean; onToggle: () => void };
}) {
  const pay = usePayOccurrence();
  const { dueDate, label, amount, remaining, status } = occurrence;
  const canPay = !readOnly && status !== 'PAID' && pay !== null;
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {showDay ? `${formatDay(dueDate)} · ` : ''}
          {money(amount)}
          {status === 'PARTIAL' && ` · reste ${money(remaining)}`}
        </p>
      </div>
      <OccurrenceStatusBadge status={status} />
    </>
  );

  if (selection)
    return (
      <li>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-primary"
            checked={selection.checked}
            disabled={selection.disabled}
            onChange={selection.onToggle}
            aria-label={`Sélectionner ${label}`}
          />
          {body}
        </label>
      </li>
    );

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">{body}</div>
      {canPay && (
        <Button
          size="sm"
          variant="outline"
          className="h-11 sm:h-9"
          onClick={() => pay.openPay(occurrence)}
        >
          Enregistrer le paiement
        </Button>
      )}
    </li>
  );
}

export function OccurrenceList({
  occurrences,
  emptyLabel,
  showDay = true,
  readOnly = false,
  selectable = false,
}: {
  occurrences: Occurrence[];
  /** Conservé pour les appelants ; le drawer n'en a plus besoin. */
  month?: string;
  emptyLabel: string;
  showDay?: boolean;
  readOnly?: boolean;
  /** Active « Sélectionner » + règlement en lot (ignoré en lecture seule). */
  selectable?: boolean;
}) {
  const open = occurrences.filter((o) => o.remaining > 0);
  const batch = useBatchSelection(open);
  const canSelect = selectable && !readOnly && open.length > 1;

  if (occurrences.length === 0)
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );

  return (
    <div>
      {canSelect && (
        <div className="mb-2 flex min-h-11 items-center justify-between gap-2">
          {batch.active ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary"
                checked={batch.allSelected}
                disabled={batch.pending}
                onChange={batch.toggleAll}
              />
              Tout sélectionner
            </label>
          ) : (
            <Button variant="outline" className="h-11" onClick={batch.start}>
              Sélectionner
            </Button>
          )}
        </div>
      )}
      <ul className="divide-y rounded-lg border">
        {occurrences.map((o) => (
          <OccurrenceRow
            key={occKey(o)}
            occurrence={o}
            showDay={showDay}
            readOnly={readOnly}
            selection={
              batch.active && canSelect
                ? {
                    checked: batch.selected.has(occKey(o)),
                    disabled: batch.pending || o.remaining <= 0,
                    onToggle: () => batch.toggle(o),
                  }
                : undefined
            }
          />
        ))}
      </ul>
      {batch.active && canSelect && (
        <BatchBar
          count={batch.chosen.length}
          total={batch.total}
          pending={batch.pending}
          error={batch.error}
          results={batch.results}
          onSubmit={batch.submit}
          onCancel={batch.reset}
        />
      )}
    </div>
  );
}
