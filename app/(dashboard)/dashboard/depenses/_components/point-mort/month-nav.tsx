'use client';

import { useTransition } from 'react';
import { useQueryStates } from 'nuqs';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listMonthOptions,
  monthLabel,
  shiftMonth,
} from '@/lib/fixed-costs/month';
import { pointMortParsers } from '../../point-mort-search-params';

/**
 * ‹ novembre 2026 › + sélecteur + « Aujourd'hui ». Le mois est dans l'URL
 * (`mois`) ; `shallow: false` relit la base, `startTransition` garde l'écran
 * actuel (avec un indicateur) pendant le chargement.
 */
export function MonthNav({
  month,
  currentMonth,
}: {
  month: string;
  currentMonth: string;
}) {
  const [pending, startTransition] = useTransition();
  const [, setParams] = useQueryStates(
    { mois: pointMortParsers.mois },
    { shallow: false, startTransition }
  );

  const go = (target: string) =>
    setParams({ mois: target === currentMonth ? null : target });

  const options = listMonthOptions(month);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-11 w-11"
        onClick={() => go(shiftMonth(month, -1))}
        aria-label="Mois précédent"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Select value={month} onValueChange={go}>
        <SelectTrigger
          className="h-11 min-w-44 capitalize"
          aria-label="Choisir un mois"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="capitalize">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="icon"
        className="h-11 w-11"
        onClick={() => go(shiftMonth(month, 1))}
        aria-label="Mois suivant"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {month !== currentMonth && (
        <Button
          variant="ghost"
          className="h-11"
          onClick={() => go(currentMonth)}
        >
          Aujourd’hui
        </Button>
      )}

      <span aria-live="polite" className="sr-only">
        {monthLabel(month)}
      </span>
      {pending && (
        <Loader2
          className="h-4 w-4 animate-spin text-muted-foreground"
          aria-label="Chargement"
        />
      )}
    </div>
  );
}
