// lib/fixed-costs/chart.ts
//
// Mise en forme (pure) des jours de point mort pour le graphique CA vs seuil.
// On ne sérialise vers le client que ce que le graphique lit (pas `shares`).

import type { BreakEvenDay } from './compute';

export type BreakEvenChartPoint = {
  date: string;
  revenue: number;
  /** CA minimal ; `null` = marge inconnue (aucun point tracé). */
  breakEven: number | null;
  open: boolean;
};

/** Ordre chronologique (le tableau, lui, affiche le plus récent en haut). */
export function toChartPoints(days: BreakEvenDay[]): BreakEvenChartPoint[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      revenue: d.revenue,
      breakEven: d.target,
      open: d.open,
    }));
}

/** Aucun seuil calculable sur la plage (marge inconnue) : graphique inutile. */
export function hasNoThreshold(points: BreakEvenChartPoint[]): boolean {
  return points.every((p) => p.breakEven === null);
}
