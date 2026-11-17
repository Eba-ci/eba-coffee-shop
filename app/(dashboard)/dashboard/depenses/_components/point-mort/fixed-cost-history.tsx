// Écran de détection de l'historique des catégories fixes (#451).
//
// La détection est en lecture seule ; seule l'action « Créer la charge depuis
// l'historique » (#452, `backfill-action.tsx`) écrit, et uniquement une prise
// d'effet : aucune dépense n'est créée ni liée.

import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/fixed-costs/format';
import { shiftMonth, monthLabel } from '@/lib/fixed-costs/month';
import { suggestBackfill } from '@/lib/fixed-costs/backfill-suggestion';
import {
  IRREGULAR_AMOUNT_RATIO,
  MAX_PROBABLE_GAPS,
} from '@/lib/fixed-costs/history-detection';
import { BackfillAction } from './backfill-action';
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
export function FixedCostHistory({
  rows,
  categories = [],
}: {
  rows: CategoryHistory[];
  categories?: { id: string; name: string }[];
}) {
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
        Voici les dépenses passées qui ressemblent à des charges fixes. Rien
        n’est créé ni modifié sans ta confirmation, et aucune dépense n’est
        touchée. Les montants sont les vrais totaux, pas des estimations.
      </p>
      <ul className="divide-y rounded-lg border">
        {rows.map((row) => (
          <HistoryRow key={row.categoryId} row={row} categories={categories} />
        ))}
      </ul>
    </div>
  );
}

function HistoryRow({
  row,
  categories,
}: {
  row: CategoryHistory;
  categories: { id: string; name: string }[];
}) {
  const confidence = CONFIDENCE_META[row.confidence];
  const trailingStart =
    row.trailingGaps.length > 0
      ? monthLabel(shiftMonth(row.lastMonth, 1))
      : null;
  const trailingEnd =
    row.trailingGaps.length > 0
      ? monthLabel(row.trailingGaps[row.trailingGaps.length - 1])
      : null;

  const totals = row.months.map((m) => m.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const irregular = max > min * IRREGULAR_AMOUNT_RATIO;
  const startMonth = monthLabel(row.suggestedStartMonth);

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-base font-semibold">
          {row.categoryName}
        </p>
        <Badge variant={confidence.variant}>
          <confidence.Icon className="h-3 w-3" aria-hidden />
          {confidence.label}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {plural(row.expenseCount, 'dépense', 'dépenses')} enregistrées sur{' '}
        {plural(row.months.length, 'mois', 'mois')}, de{' '}
        {monthLabel(row.firstMonth)} à {monthLabel(row.lastMonth)} :{' '}
        <span className="font-medium tabular-nums text-foreground">
          {money(row.total)}
        </span>{' '}
        au total.
      </p>

      {row.confidence === 'to-review' && (
        <p className="rounded-md bg-muted p-2 text-sm">
          <span className="font-medium">Pourquoi « à vérifier » ?</span>{' '}
          {irregular
            ? `Les montants varient beaucoup (de ${money(min)} à ${money(max)} par mois) : ce n’est peut-être pas une charge fixe.`
            : row.gaps.length > MAX_PROBABLE_GAPS
              ? 'Plusieurs mois n’ont aucune dépense : la régularité n’est pas sûre.'
              : 'Seulement deux mois d’historique : trop peu pour être certain.'}
        </p>
      )}

      <details className="group text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary sm:min-h-8">
          Voir le détail mois par mois
        </summary>
        <ul
          className="mt-1 flex flex-wrap gap-1.5"
          aria-label="Totaux réels par mois"
        >
          {row.months.map((month) => (
            <li
              key={month.month}
              className="inline-flex items-baseline gap-1 rounded-md bg-muted px-2 py-1 text-xs"
            >
              <span className="capitalize text-muted-foreground">
                {monthLabel(month.month)}
              </span>
              <span className="font-medium tabular-nums">
                {money(month.total)}
              </span>
              {month.count > 1 && (
                <span className="text-muted-foreground">
                  · {month.count} dépenses
                </span>
              )}
            </li>
          ))}
        </ul>
        {row.gaps.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Trous internes (mois sans dépense) :{' '}
            {row.gaps.map(monthLabel).join(', ')}.
          </p>
        )}
        {trailingStart && trailingEnd && (
          <p className="mt-2 text-xs text-muted-foreground">
            Puis plus rien : aucune dépense de {trailingStart} à {trailingEnd} (
            {plural(row.trailingGaps.length, 'mois', 'mois')}).
          </p>
        )}
      </details>

      {row.confidence === 'single' ? (
        <p className="text-sm text-muted-foreground">
          Dépense unique : conversion non proposée.
        </p>
      ) : (
        <div className="space-y-2 rounded-lg bg-muted/50 p-3">
          <p className="text-sm">
            <span className="font-medium">Proposition :</span>{' '}
            {row.alreadyConverted
              ? 'cette catégorie a déjà une charge fixe. '
              : 'en faire une charge fixe mensuelle. '}
            Son suivi (point mort, retards) commencerait en{' '}
            <span className="font-medium capitalize">{startMonth}</span>, le
            mois de la première dépense.
          </p>
          {categories.length > 0 && (
            <BackfillAction
              suggestion={suggestBackfill(row)}
              categories={categories}
            />
          )}
        </div>
      )}
    </li>
  );
}
