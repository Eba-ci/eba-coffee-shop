'use client';

import type { BreakEvenDay } from '@/lib/fixed-costs/compute';
import { buildCalendarGrid, dayStatus } from '@/lib/fixed-costs/month';
import { formatDayLong } from '@/lib/fixed-costs/format';
import { cn } from '@/lib/utils';
import { STATUS_META, compactMoney, isMissed, money } from './status';

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** Grille du mois (lun→dim). Une case = un bouton qui ouvre le détail du jour. */
export function CalendarView({
  days,
  today,
  onlyMissed,
  onSelect,
}: {
  days: BreakEvenDay[];
  today: string;
  onlyMissed: boolean;
  onSelect: (date: string) => void;
}) {
  const weeks = buildCalendarGrid(days);

  return (
    <div role="grid" aria-label="Calendrier du mois" className="space-y-1">
      <div role="row" className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
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
          {week.map((day, j) =>
            day === null ? (
              <div key={j} role="gridcell" aria-hidden />
            ) : (
              <DayCell
                key={day.date}
                day={day}
                today={today}
                dimmed={onlyMissed && !isMissed(dayStatus(day, today))}
                onSelect={onSelect}
              />
            )
          )}
        </div>
      ))}
    </div>
  );
}

function DayCell({
  day,
  today,
  dimmed,
  onSelect,
}: {
  day: BreakEvenDay;
  today: string;
  dimmed: boolean;
  onSelect: (date: string) => void;
}) {
  const status = dayStatus(day, today);
  const meta = STATUS_META[status];
  const showRevenue = status !== 'closed' && status !== 'upcoming';

  return (
    <div role="gridcell">
      <button
        type="button"
        onClick={() => onSelect(day.date)}
        aria-label={`${formatDayLong(day.date)} : ${meta.label}${
          showRevenue
            ? `, CA ${money(day.revenue)} sur ${money(day.breakEven)}`
            : ''
        }`}
        className={cn(
          'flex min-h-14 w-full flex-col justify-between rounded-md border p-1.5 text-left transition-colors hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-20 sm:p-2',
          meta.cell,
          day.date === today && 'ring-2 ring-primary',
          dimmed && 'opacity-30'
        )}
      >
        <span className="flex items-start justify-between gap-1">
          <span className="text-sm font-semibold tabular-nums">
            {Number(day.date.slice(8, 10))}
          </span>
          <meta.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </span>
        {showRevenue && (
          <span className="hidden text-xs tabular-nums sm:block">
            {compactMoney(day.revenue)}
            <span className="text-muted-foreground">
              {' '}
              / {compactMoney(day.breakEven ?? 0)}
            </span>
          </span>
        )}
      </button>
    </div>
  );
}
