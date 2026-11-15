// Libellés, styles et liens des cases de la vue historique (#454). La couleur
// n'est jamais seule : chaque état a un libellé court affiché dans la case.

import type { HistoryCellState } from '@/lib/fixed-costs/history-grid';

export const HISTORY_CELL_META: Record<
  HistoryCellState,
  { label: string; className: string }
> = {
  PAID: {
    label: 'Payé',
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  },
  PARTIAL: {
    label: 'Partiel',
    className:
      'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
  },
  UNPAID: {
    label: 'Impayé',
    className:
      'border-red-400 bg-red-100 text-red-950 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100',
  },
  LATE: {
    label: 'En retard',
    className:
      'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
  },
  UPCOMING: {
    label: 'À venir',
    className:
      'border-dashed border-border bg-background text-muted-foreground',
  },
  NA: {
    label: '—',
    className: 'border-transparent bg-transparent text-muted-foreground/50',
  },
};

/**
 * Ouvre le mois dans l'onglet Paiements ; un mois impayé ou partiel mène droit
 * au rapprochement (une dépense existe peut-être sans être liée).
 */
export function historyCellHref(month: string, state: HistoryCellState) {
  const anchor =
    state === 'UNPAID' || state === 'PARTIAL' ? '#rapprochement' : '';
  return `/dashboard/depenses?tab=paiements&mois=${month}${anchor}`;
}
