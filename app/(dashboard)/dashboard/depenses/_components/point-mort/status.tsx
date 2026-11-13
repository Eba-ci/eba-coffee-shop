// Libellés, couleurs et icônes des états d'un jour (calendrier, liste, détail).
// La couleur n'est jamais seule : chaque état porte aussi une icône et un texte.

import {
  CalendarClock,
  Check,
  Minus,
  Moon,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { DayStatus } from '@/lib/fixed-costs/month';

export type StatusMeta = {
  label: string;
  Icon: LucideIcon;
  /** Case du calendrier. */
  cell: string;
  /** Pastille / badge. */
  badge: string;
  /** Barre de progression. */
  bar: string;
};

export const STATUS_META: Record<DayStatus, StatusMeta> = {
  reached: {
    label: 'Atteint',
    Icon: Check,
    cell: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
    badge:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    bar: 'bg-emerald-500',
  },
  missed: {
    label: 'Non atteint',
    Icon: X,
    cell: 'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
    badge: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    bar: 'bg-red-500',
  },
  pending: {
    label: 'En cours',
    Icon: CalendarClock,
    cell: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    bar: 'bg-amber-500',
  },
  closed: {
    label: 'Fermé',
    Icon: Moon,
    cell: 'border-transparent bg-muted text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground/40',
  },
  upcoming: {
    label: 'À venir',
    Icon: CalendarClock,
    cell: 'border-dashed border-border bg-background text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground/40',
  },
  unknown: {
    label: 'Marge inconnue',
    Icon: Minus,
    cell: 'border-border bg-background',
    badge: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground/40',
  },
};

// Mise en forme des montants : source unique `lib/fixed-costs/format`.
export { money, compactMoney } from '@/lib/fixed-costs/format';

/** Jours à montrer quand « Jours non atteints » est actif. */
export const isMissed = (s: DayStatus) => s === 'missed' || s === 'pending';
