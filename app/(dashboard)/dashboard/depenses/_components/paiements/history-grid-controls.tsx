'use client';

// Plage et filtre de la vue historique (#454), dans l'URL (nuqs) : `histo`
// (6 | 12 | 24 mois) relit la base, `impayes=1` ne garde que les charges ayant
// au moins un mois sans aucun paiement.

import { useTransition } from 'react';
import { useQueryStates } from 'nuqs';
import { Button } from '@heroui/react';
import { HISTORY_RANGE_CHOICES } from '@/lib/fixed-costs/history-grid-ranges';
import { pointMortParsers } from '../../point-mort-search-params';

export function HistoryGridControls({
  months,
  onlyUnpaid,
}: {
  months: number;
  onlyUnpaid: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [, setParams] = useQueryStates(
    { histo: pointMortParsers.histo, impayes: pointMortParsers.impayes },
    { shallow: false, startTransition }
  );
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-busy={pending}
      role="group"
      aria-label="Plage de l’historique"
    >
      {HISTORY_RANGE_CHOICES.map((n) => (
        <Button
          key={n}
          size="sm"
          color="primary"
          variant={n === months ? 'solid' : 'bordered'}
          className="h-11 sm:h-9"
          aria-pressed={n === months}
          onPress={() => setParams({ histo: n === 12 ? null : n })}
        >
          {n} mois
        </Button>
      ))}
      <Button
        size="sm"
        color="primary"
        variant={onlyUnpaid ? 'solid' : 'bordered'}
        className="h-11 sm:h-9"
        aria-pressed={onlyUnpaid}
        onPress={() => setParams({ impayes: onlyUnpaid ? null : true })}
      >
        Mois sans aucun paiement
      </Button>
    </div>
  );
}
