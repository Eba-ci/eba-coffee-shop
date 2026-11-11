import { Target, TrendingUp } from 'lucide-react';
import type { MonthProjection, MonthSummary } from '@/lib/fixed-costs/month';
import { cn } from '@/lib/utils';
import { money } from './status';

/** Bandeau en tête de mois : jours atteints, cumuls et projection. */
export function MonthSummaryBar({
  summary,
  projection,
  isCurrentMonth,
}: {
  summary: MonthSummary;
  projection: MonthProjection | null;
  isCurrentMonth: boolean;
}) {
  const target = summary.breakEvenToDate;
  const pct =
    target && target > 0
      ? Math.min(100, Math.round((summary.revenueToDate / target) * 100))
      : null;
  const reachedAll = target !== null && summary.revenueToDate >= target;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Jours au-dessus du seuil"
          value={`${summary.reachedDays} / ${summary.elapsedOpenDays}`}
          hint={`${summary.openDays} jours ouvrés dans le mois`}
        />
        <Stat
          label="CA net cumulé"
          value={money(summary.revenueToDate)}
          hint={`point mort cumulé ${money(target)}`}
        />
        <Stat
          label="Charges fixes du mois"
          value={money(summary.fixedCostMonth)}
        />
        <Stat
          label="Résultat estimé cumulé"
          value={money(summary.resultToDate)}
          danger={summary.resultToDate !== null && summary.resultToDate < 0}
        />
      </div>

      {pct !== null && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="CA cumulé par rapport au point mort cumulé"
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full',
              reachedAll ? 'bg-emerald-500' : 'bg-amber-500'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {isCurrentMonth && projection && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Au rythme actuel ({money(projection.avgRevenuePerOpenDay)} par jour
            ouvré), le mois finirait autour de{' '}
            <strong className="text-foreground">
              {money(projection.projectedRevenue)}
            </strong>{' '}
            de CA pour {money(projection.monthBreakEven)} de point mort, soit un
            résultat estimé de{' '}
            <strong
              className={cn(
                projection.projectedResult < 0
                  ? 'text-destructive'
                  : 'text-foreground'
              )}
            >
              {projection.projectedResult >= 0 ? '+' : ''}
              {money(projection.projectedResult)}
            </strong>
            . Estimation, pas un engagement.
          </span>
        </p>
      )}
      {isCurrentMonth && !projection && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          La projection de fin de mois apparaît après 3 jours ouvrés écoulés (et
          si la marge est calculable).
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-lg font-semibold tabular-nums',
          danger && 'text-destructive'
        )}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
