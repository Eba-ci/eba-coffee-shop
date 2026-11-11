'use client';

import { useState } from 'react';
import type { Occurrence } from '@/lib/fixed-costs/schedule';
import {
  buildPaymentGrid,
  dominantStatus,
  groupByDueDate,
  sumAmount,
} from '@/lib/fixed-costs/payments';
import {
  WEEKDAYS_MONDAY_FIRST,
  compactMoney,
  formatDayLong,
  money,
} from '@/lib/fixed-costs/format';
import { cn } from '@/lib/utils';
import { OCCURRENCE_STATUS_META } from './status';
import { DayOccurrencesSheet } from './day-occurrences-sheet';

/** Grille du mois (lun→dim) : chaque jour porte ses échéances et son statut. */
export function PaymentsCalendar({
  month,
  today,
  occurrences,
  readOnly = false,
}: {
  month: string;
  today: string;
  occurrences: Occurrence[];
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const byDate = groupByDueDate(occurrences);
  const weeks = buildPaymentGrid(month);
  const selectedOcc = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <div className="space-y-3">
      <div
        role="grid"
        aria-label="Calendrier des paiements"
        className="space-y-1"
      >
        <div role="row" className="grid grid-cols-7 gap-1">
          {WEEKDAYS_MONDAY_FIRST.map((w) => (
            <div
              key={w}
              role="columnheader"
              className="py-1 text-center text-xs font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div key={i} role="row" className="grid grid-cols-7 gap-1">
            {week.map((cell, j) =>
              cell === null ? (
                <div key={j} role="gridcell" aria-hidden />
              ) : (
                <DayCell
                  key={cell.date}
                  date={cell.date}
                  today={today}
                  occurrences={byDate.get(cell.date) ?? []}
                  onSelect={setSelected}
                />
              )
            )}
          </div>
        ))}
      </div>

      <DayOccurrencesSheet
        date={selected}
        occurrences={selectedOcc}
        month={month}
        readOnly={readOnly}
        onClose={() => setSelected(null)}
      />
      <p className="text-xs text-muted-foreground">
        Touche un jour pour voir ses échéances et enregistrer un paiement.
      </p>
    </div>
  );
}

function DayCell({
  date,
  today,
  occurrences,
  onSelect,
}: {
  date: string;
  today: string;
  occurrences: Occurrence[];
  onSelect: (date: string) => void;
}) {
  const status = dominantStatus(occurrences);
  const meta = status ? OCCURRENCE_STATUS_META[status] : null;
  const has = occurrences.length > 0;
  const total = sumAmount(occurrences);

  return (
    <div role="gridcell">
      <button
        type="button"
        onClick={() => has && onSelect(date)}
        disabled={!has}
        aria-label={
          has
            ? `${formatDayLong(date)} : ${occurrences.length} échéance(s), ${money(total)}`
            : formatDayLong(date)
        }
        className={cn(
          'flex min-h-14 w-full flex-col justify-between rounded-md border p-1.5 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-20 sm:p-2',
          has && meta ? meta.cell : 'border-border bg-background',
          has && 'hover:brightness-95',
          !has && 'cursor-default',
          date === today && 'ring-2 ring-primary'
        )}
      >
        <span className="flex items-start justify-between gap-1">
          <span className="text-sm font-semibold tabular-nums">
            {Number(date.slice(8, 10))}
          </span>
          {meta && <meta.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        </span>
        {has && (
          <>
            <span className="hidden text-xs tabular-nums sm:block">
              {occurrences.length} · {compactMoney(total)}
            </span>
            <span className="text-[10px] tabular-nums sm:hidden">
              {occurrences.length} éch.
            </span>
          </>
        )}
      </button>
    </div>
  );
}
