// Libellés, couleurs et icônes des états d'une échéance de charge fixe.
// La couleur n'est jamais seule : chaque état porte aussi une icône et un texte.

import {
  CalendarClock,
  CheckCircle2,
  Clock,
  CircleDollarSign,
  type LucideIcon,
} from 'lucide-react';
import type { OccurrenceStatus } from '@/lib/fixed-costs/schedule';

export { compactMoney, money } from '../point-mort/status';

export type OccurrenceStatusMeta = {
  label: string;
  Icon: LucideIcon;
  /** Case du calendrier. */
  cell: string;
  /** Pastille / badge. */
  badge: string;
};

export const OCCURRENCE_STATUS_META: Record<
  OccurrenceStatus,
  OccurrenceStatusMeta
> = {
  PAID: {
    label: 'Payé',
    Icon: CheckCircle2,
    cell: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
    badge:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  PARTIAL: {
    label: 'Partiel',
    Icon: CircleDollarSign,
    cell: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  },
  UPCOMING: {
    label: 'À venir',
    Icon: CalendarClock,
    cell: 'border-dashed border-border bg-background text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
  },
  LATE: {
    label: 'En retard',
    Icon: Clock,
    cell: 'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
    badge: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
};
