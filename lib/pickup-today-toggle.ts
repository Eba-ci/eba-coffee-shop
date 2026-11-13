// Fermeture / réouverture manuelle de la boutique pour AUJOURD'HUI.
//
// Même mécanisme que « Dates spéciales » dans Paramètres : une exception de
// date `closed: true`. `getRangesForDay` lui donne priorité sur les horaires
// hebdomadaires, donc le site public et `/api/shop-status` suivent.
import type { PickupSettings } from '@/lib/pickup-settings';

/** Aujourd'hui (clé `YYYY-MM-DD`, Abidjan) est-il marqué fermé ? */
export function isClosedByOverride(
  settings: PickupSettings,
  todayKey: string
): boolean {
  return settings.dateOverrides.some((o) => o.date === todayKey && o.closed);
}

/**
 * Ferme (`closed: true`) ou rouvre aujourd'hui. Rouvrir supprime l'exception :
 * le jour retombe sur les horaires hebdomadaires.
 */
export function setTodayClosed(
  settings: PickupSettings,
  todayKey: string,
  closed: boolean
): PickupSettings {
  const others = settings.dateOverrides.filter((o) => o.date !== todayKey);
  return {
    ...settings,
    dateOverrides: closed
      ? [...others, { date: todayKey, closed: true, ranges: [] }]
      : others,
  };
}
