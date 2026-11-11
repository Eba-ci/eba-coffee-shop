// lib/fixed-costs/installments.ts
//
// Validation PURE d'un jeu d'échéances contre la périodicité et le montant de
// la charge. Appelée par les écritures avec les valeurs FINALES (une mise à
// jour partielle peut changer la périodicité sans renvoyer les échéances).

import type { InstallmentLike } from './schedule';
import { installmentsTotal } from './schedule';

type Periodicity = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

const MONTHS: Record<Periodicity, number> = {
  DAILY: 0,
  WEEKLY: 0,
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/** Message d'erreur (français) ou null si le jeu d'échéances est cohérent. */
export function installmentsError(
  periodicity: Periodicity,
  amount: number,
  installments: InstallmentLike[]
): string | null {
  if (installments.length === 0) return null; // échéance par défaut
  if (periodicity === 'DAILY')
    return 'Une charge par jour ouvré n’a pas d’échéances';
  const seen = new Set<string>();
  for (const i of installments) {
    const maxDay = periodicity === 'WEEKLY' ? 7 : 31;
    if (i.day < 1 || i.day > maxDay)
      return periodicity === 'WEEKLY'
        ? 'Jour de semaine invalide (1 = lundi … 7 = dimanche)'
        : 'Jour du mois invalide (1 à 31)';
    if (i.monthOffset < 0 || i.monthOffset >= Math.max(MONTHS[periodicity], 1))
      return 'Mois de l’échéance hors de la période';
    const key = `${i.monthOffset}|${i.day}`;
    if (seen.has(key)) return 'Deux échéances le même jour';
    seen.add(key);
  }
  if (installmentsTotal(installments) !== amount)
    return 'Le total des échéances doit égaler le montant de la charge';
  return null;
}
