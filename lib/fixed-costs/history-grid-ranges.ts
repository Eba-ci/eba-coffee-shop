// Plages de la vue historique (#454). Module SANS dépendance serveur : partagé
// par l'écran (client) et la lecture (serveur).

export const HISTORY_RANGE_CHOICES = [6, 12, 24] as const;
export const DEFAULT_HISTORY_MONTHS = 12;

export function clampHistoryMonths(value: number | null | undefined): number {
  return (HISTORY_RANGE_CHOICES as readonly number[]).includes(value ?? -1)
    ? (value as number)
    : DEFAULT_HISTORY_MONTHS;
}
