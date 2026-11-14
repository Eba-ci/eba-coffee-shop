'use client';

import { useTransition } from 'react';
import { useQueryStates } from 'nuqs';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { monthLabel, shiftMonth } from '@/lib/fixed-costs/month';
import { paieParsers } from './search-params';

/**
 * ‹ novembre 2026 › + « Aujourd'hui ». Même patron que le Point mort : le mois
 * vit dans l'URL (`mois`), `shallow: false` relit la base et `startTransition`
 * garde l'écran visible pendant le chargement.
 *
 * Pas de `<select>` : la règle des écrans Employés interdit tout champ de
 * formulaire sur la Paie du mois. Deux chevrons et le mois écrit suffisent.
 */
export function SalairesMonthNav({
  month,
  currentMonth,
}: {
  month: string;
  currentMonth: string;
}) {
  const [pending, startTransition] = useTransition();
  const [, setParams] = useQueryStates(
    { mois: paieParsers.mois },
    { shallow: false, startTransition }
  );

  const go = (target: string) =>
    setParams({ mois: target === currentMonth ? null : target });

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

      <p
        aria-live="polite"
        className="min-w-32 text-center text-sm font-medium capitalize"
      >
        {monthLabel(month)}
      </p>

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

      {pending && (
        <Loader2
          className="h-4 w-4 animate-spin text-muted-foreground"
          aria-label="Chargement"
        />
      )}
    </div>
  );
}
