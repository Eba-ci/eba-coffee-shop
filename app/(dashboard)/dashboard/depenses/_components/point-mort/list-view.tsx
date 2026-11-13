'use client';

import type { BreakEvenDay } from '@/lib/fixed-costs/compute';
import { dayStatus } from '@/lib/fixed-costs/month';
import { formatDay, weekdayShort } from '@/lib/fixed-costs/format';
import { cn } from '@/lib/utils';
import { STATUS_META, isMissed, money } from './status';

/**
 * Liste de cartes, du plus récent au plus ancien. Les jours à venir sont
 * regroupés en fin de liste, les jours fermés tiennent sur une ligne fine.
 */
export function ListView({
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
  const withStatus = [...days]
    .reverse()
    .map((day) => ({ day, status: dayStatus(day, today) }));
  // Tout ce qui est après aujourd'hui (même un lundi fermé) va dans « À venir ».
  const past = withStatus.filter((d) => d.day.date <= today);
  const upcoming = withStatus.filter((d) => d.day.date > today).reverse();
  const shown = onlyMissed ? past.filter((d) => isMissed(d.status)) : past;

  if (shown.length === 0 && (onlyMissed || upcoming.length === 0)) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {onlyMissed
          ? 'Aucun jour sous le seuil sur ce mois.'
          : 'Aucun jour à afficher.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {shown.map(({ day, status }) =>
        status === 'closed' ? (
          <ClosedRow key={day.date} day={day} onSelect={onSelect} />
        ) : (
          <DayCard
            key={day.date}
            day={day}
            status={status}
            isToday={day.date === today}
            onSelect={onSelect}
          />
        )
      )}
      {!onlyMissed && upcoming.length > 0 && (
        <details className="rounded-lg border">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-muted-foreground">
            À venir · {upcoming.length} jour{upcoming.length > 1 ? 's' : ''}
          </summary>
          <ul className="divide-y border-t">
            {upcoming.map(({ day }) => (
              <li key={day.date}>
                <button
                  type="button"
                  onClick={() => onSelect(day.date)}
                  className="flex min-h-11 w-full items-center justify-between px-3 text-sm"
                >
                  <span>
                    {weekdayShort(day.date)} {formatDay(day.date)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {day.open ? `seuil ${money(day.target)}` : 'Fermé'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ClosedRow({
  day,
  onSelect,
}: {
  day: BreakEvenDay;
  onSelect: (date: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(day.date)}
      className="flex min-h-11 w-full items-center justify-between rounded-lg bg-muted px-3 text-sm text-muted-foreground"
    >
      <span>
        {weekdayShort(day.date)} {formatDay(day.date)}
      </span>
      <span>Fermé</span>
    </button>
  );
}

function DayCard({
  day,
  status,
  isToday,
  onSelect,
}: {
  day: BreakEvenDay;
  status: ReturnType<typeof dayStatus>;
  isToday: boolean;
  onSelect: (date: string) => void;
}) {
  const meta = STATUS_META[status];
  const target = day.target ?? 0;
  const pct = target > 0 ? Math.round((day.revenue / target) * 100) : 100;

  return (
    <button
      type="button"
      onClick={() => onSelect(day.date)}
      className={cn(
        'w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        isToday && 'ring-2 ring-primary'
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {weekdayShort(day.date)} {formatDay(day.date)}
          {isToday && (
            <span className="ml-2 text-xs text-muted-foreground">
              aujourd’hui
            </span>
          )}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            meta.badge
          )}
        >
          <meta.Icon className="h-3 w-3" aria-hidden />
          {meta.label}
        </span>
      </span>

      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-label="CA par rapport au point mort"
        className="mt-2 block h-2 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn('block h-full rounded-full', meta.bar)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </span>

      <span className="mt-2 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>
          {money(day.revenue)} / {money(day.target)}
        </span>
        <span
          className={cn(
            day.result !== null && day.result < 0 && 'text-destructive'
          )}
        >
          {day.result === null
            ? '—'
            : `${day.result >= 0 ? '+' : ''}${money(day.result)}`}
        </span>
      </span>
    </button>
  );
}
