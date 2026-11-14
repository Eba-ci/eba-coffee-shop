// Écran de détection de l'historique des catégories fixes (#451).
//
// LECTURE SEULE : ce composant ne contient aucun formulaire, bouton d'action ni
// appel de mutation. Il se contente d'afficher le résultat de
// `detectFixedCostHistory` (via `getFixedCostHistory`). Le backfill est #452.

import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/fixed-costs/format';
import { shiftMonth, monthLabel } from '@/lib/fixed-costs/month';
import type {
  CategoryHistory,
  HistoryConfidence,
} from '@/lib/fixed-costs/history-detection';

const CONFIDENCE_META: Record<
  HistoryConfidence,
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline';
    Icon: typeof CheckCircle2;
  }
> = {
  probable: {
    label: 'Récurrente probable',
    variant: 'default',
    Icon: CheckCircle2,
  },
  'to-review': {
    label: 'À vérifier',
    variant: 'secondary',
    Icon: AlertTriangle,
  },
  single: {
    label: 'Dépense unique',
    variant: 'outline',
    Icon: CircleHelp,
  },
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count > 1 ? many : one}`;

/**
 * Résultat de la détection, tous rôles en lecture. Chaque catégorie montre ses
 * bornes, ses totaux RÉELS par mois, ses trous et la proposition (prise
 * d'effet, périodicité, confiance) sans déclencher aucune écriture.
 */
export function FixedCostHistory({ rows }: { rows: CategoryHistory[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Aucune catégorie fixe avec des dépenses à détecter.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Lecture seule : ces propositions ne créent, ne modifient et ne lient
        rien. Les montants sont les totaux réels des dépenses, jamais une
        estimation.
      </p>
      <ul className="divide-y rounded-lg border">
        {rows.map((row) => (
          <HistoryRow key={row.categoryId} row={row} />
        ))}
      </ul>
    </div>
  );
}

function HistoryRow({ row }: { row: CategoryHistory }) {
  const confidence = CONFIDENCE_META[row.confidence];
  const trailingStart =
    row.trailingGaps.length > 0
      ? monthLabel(shiftMonth(row.lastMonth, 1))
      : null;
  const trailingEnd =
    row.trailingGaps.length > 0
      ? monthLabel(row.trailingGaps[row.trailingGaps.length - 1])
      : null;

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words font-medium">{row.categoryName}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={row.alreadyConverted ? 'outline' : 'secondary'}>
            {row.alreadyConverted ? 'Déjà convertie' : 'Jamais convertie'}
          </Badge>
          <Badge variant={confidence.variant}>
            <confidence.Icon className="h-3 w-3" aria-hidden />
            {confidence.label}
          </Badge>
        </div>
      </div>

      <p className="text-xs tabular-nums text-muted-foreground">
        {monthLabel(row.firstMonth)} → {monthLabel(row.lastMonth)} ·{' '}
        {plural(row.months.length, 'mois couvert', 'mois couverts')} ·{' '}
        {plural(row.expenseCount, 'dépense', 'dépenses')} · {money(row.total)}
      </p>

      <ul className="flex flex-wrap gap-1.5" aria-label="Totaux réels par mois">
        {row.months.map((month) => (
          <li
            key={month.month}
            className="inline-flex items-baseline gap-1 rounded-md bg-muted px-2 py-1 text-xs"
          >
            <span className="capitalize text-muted-foreground">
              {monthLabel(month.month)}
            </span>
            <span className="tabular-nums font-medium">
              {money(month.total)}
            </span>
            {month.count > 1 && (
              <span className="text-muted-foreground">({month.count})</span>
            )}
          </li>
        ))}
      </ul>

      {row.gaps.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Trous internes : {row.gaps.map(monthLabel).join(', ')}.
        </p>
      )}

      {trailingStart && trailingEnd && (
        <p className="text-xs text-muted-foreground">
          Puis plus rien : aucune dépense de {trailingStart} à {trailingEnd} (
          {plural(row.trailingGaps.length, 'mois', 'mois')}).
        </p>
      )}

      <p className="text-xs">
        {row.confidence === 'single' ? (
          'Dépense unique : conversion non proposée.'
        ) : (
          <>
            Prise d’effet proposée :{' '}
            <span className="font-medium capitalize">
              {monthLabel(row.suggestedStartMonth)}
            </span>{' '}
            · périodicité mensuelle.
          </>
        )}
      </p>
    </li>
  );
}
