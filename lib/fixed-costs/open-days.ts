// lib/fixed-costs/open-days.ts
//
// Jours ouvrés = jours où la boutique a au moins une plage d'ouverture, selon
// les horaires de Paramètres (`weeklyHours` + exceptions `dateOverrides`).
// Réutilise `getRangesForDay` ; on lui passe une date LOCALE construite depuis
// la chaîne, car il lit `getDay()` / `formatDateKey` en local : le résultat ne
// dépend donc pas du fuseau du runtime.

import { getRangesForDay, type PickupSettings } from '@/lib/pickup-settings';
import { eachDay } from './periods';

export type OpenDayPredicate = (day: string) => boolean;

export function isOpenDay(day: string, settings: PickupSettings): boolean {
  const local = new Date(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10))
  );
  return getRangesForDay(local, settings).length > 0;
}

export function openDayPredicate(settings: PickupSettings): OpenDayPredicate {
  return (day) => isOpenDay(day, settings);
}

/** Nombre de jours ouvrés dans [start, end]. */
export function countOpenDays(
  start: string,
  end: string,
  isOpen: OpenDayPredicate
): number {
  return eachDay(start, end).filter(isOpen).length;
}
