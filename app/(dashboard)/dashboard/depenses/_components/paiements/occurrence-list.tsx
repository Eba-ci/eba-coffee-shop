// Liste d'échéances de charges fixes avec leur statut et l'action
// « Enregistrer le paiement ». Composant neutre (aucun hook) : rendu aussi
// bien côté serveur (listes) que dans la feuille du calendrier (client).

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Occurrence, OccurrenceStatus } from '@/lib/fixed-costs/schedule';
import { formatDay } from '@/lib/fixed-costs/format';
import { cn } from '@/lib/utils';
import { OCCURRENCE_STATUS_META, money } from './status';

/** Lien vers la saisie de dépense, pré-remplie et liée à l'occurrence. */
export function payHref(o: Occurrence, month: string): string {
  const sp = new URLSearchParams({
    chargefixe: o.costId,
    echeance: o.dueDate,
    mois: month,
  });
  return `/dashboard/depenses/nouvelle?${sp.toString()}`;
}

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
  month,
  showDay,
  readOnly = false,
}: {
  occurrence: Occurrence;
  month: string;
  showDay: boolean;
  readOnly?: boolean;
}) {
  const { dueDate, label, amount, remaining, status } = occurrence;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {showDay ? `${formatDay(dueDate)} · ` : ''}
          {money(amount)}
          {status === 'PARTIAL' && ` · reste ${money(remaining)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <OccurrenceStatusBadge status={status} />
        {!readOnly && status !== 'PAID' && (
          <Button asChild size="sm" variant="outline" className="h-11 sm:h-9">
            <Link href={payHref(occurrence, month)}>
              Enregistrer le paiement
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

export function OccurrenceList({
  occurrences,
  month,
  emptyLabel,
  showDay = true,
  readOnly = false,
}: {
  occurrences: Occurrence[];
  month: string;
  emptyLabel: string;
  showDay?: boolean;
  readOnly?: boolean;
}) {
  if (occurrences.length === 0)
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  return (
    <ul className="divide-y rounded-lg border">
      {occurrences.map((o) => (
        <OccurrenceRow
          key={`${o.costId}-${o.dueDate}`}
          occurrence={o}
          month={month}
          showDay={showDay}
          readOnly={readOnly}
        />
      ))}
    </ul>
  );
}
