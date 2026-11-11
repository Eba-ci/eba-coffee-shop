'use client';

import type { BreakEvenDay } from '@/lib/fixed-costs/compute';
import { dayStatus } from '@/lib/fixed-costs/month';
import { formatDayLong } from '@/lib/fixed-costs/format';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { STATUS_META, money } from './status';

function Row({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          strong && 'font-semibold',
          danger && 'text-destructive'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Détail d'un jour : CA, seuil, charges ligne par ligne, résultat. */
export function DayDetailSheet({
  day,
  today,
  onClose,
}: {
  day: BreakEvenDay | null;
  today: string;
  onClose: () => void;
}) {
  const status = day ? dayStatus(day, today) : null;
  const meta = status ? STATUS_META[status] : null;
  const target = day?.breakEven ?? 0;
  const pct =
    day && target > 0
      ? Math.min(100, Math.round((day.revenue / target) * 100))
      : 0;

  return (
    <Sheet open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {day && meta && status && (
          <>
            <SheetHeader>
              <SheetTitle className="first-letter:uppercase">
                {formatDayLong(day.date)}
              </SheetTitle>
              <SheetDescription asChild>
                <span
                  className={cn(
                    'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                    meta.badge
                  )}
                >
                  <meta.Icon className="h-3 w-3" aria-hidden />
                  {meta.label}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              {status === 'closed' && (
                <p className="text-sm text-muted-foreground">
                  Boutique fermée ce jour-là d’après tes horaires : aucune
                  charge n’est répartie et le point mort est de 0 F.
                  {day.revenue > 0 &&
                    ` CA enregistré malgré tout : ${money(day.revenue)}.`}
                </p>
              )}

              {status === 'upcoming' && (
                <p className="text-sm text-muted-foreground">
                  Jour à venir : voici les charges prévues et le CA à viser.
                </p>
              )}

              {day.open && status !== 'upcoming' && (
                <div className="space-y-2">
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    aria-label="CA par rapport au point mort"
                    className="h-3 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn('h-full rounded-full', meta.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-sm tabular-nums">
                    {money(day.revenue)} sur {money(day.breakEven)} ({pct} %)
                  </p>
                </div>
              )}

              {day.open && (
                <dl className="divide-y rounded-lg border px-3">
                  {status !== 'upcoming' && (
                    <Row label="CA net" value={money(day.revenue)} strong />
                  )}
                  <Row label="Point mort" value={money(day.breakEven)} />
                  {status !== 'upcoming' && (
                    <Row label="Reste à faire" value={money(day.remaining)} />
                  )}
                  <Row
                    label="Charges fixes du jour"
                    value={money(day.fixedCost)}
                  />
                  {status !== 'upcoming' && (
                    <>
                      <Row
                        label="Marge estimée"
                        value={money(day.grossMargin)}
                      />
                      <Row
                        label="Résultat"
                        value={money(day.result)}
                        strong
                        danger={day.result !== null && day.result < 0}
                      />
                    </>
                  )}
                </dl>
              )}

              {day.shares.length > 0 && (
                <section>
                  <h3 className="mb-1 text-sm font-medium">Charges du jour</h3>
                  <ul className="divide-y rounded-lg border px-3">
                    {day.shares.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
                      >
                        <span className="truncate">{s.label}</span>
                        <span className="tabular-nums">
                          {money(Math.round(s.amount))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
