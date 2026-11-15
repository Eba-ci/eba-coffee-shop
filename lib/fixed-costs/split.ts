// lib/fixed-costs/split.ts
//
// Fractionnement d'une charge en échéances (#459). Fonctions PURES : la somme
// des échéances proposées égale toujours le montant de la charge, au franc près.

import { FIXED_COST_MAX_INSTALLMENTS } from '@/config/constants';
import type { FixedCostLike } from './compute';
import type { InstallmentLike } from './schedule';

type Periodicity = FixedCostLike['periodicity'];

/** Nombre maximal d'échéances que la périodicité permet de répartir. */
export function maxSplitCount(periodicity: Periodicity): number {
  switch (periodicity) {
    case 'DAILY':
      return 0;
    case 'WEEKLY':
      return 7;
    case 'QUARTERLY':
      return 3;
    default:
      return FIXED_COST_MAX_INSTALLMENTS;
  }
}

/**
 * `count` montants entiers dont la somme est exactement `total` ; les francs
 * restants vont aux premières échéances (écart max. 1 F entre deux montants).
 */
export function splitAmount(total: number, count: number): number[] {
  if (!(count >= 1) || !Number.isInteger(count)) return [];
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Échéances proposées pour `count` paiements : hebdo = jours de la semaine
 * espacés ; mensuel = tous les ~7 jours à partir du jour de prise d'effet ;
 * trimestre / année = un mois sur `step`, au jour de prise d'effet.
 */
export function splitInstallments(
  periodicity: Periodicity,
  amount: number,
  count: number,
  startDay: number
): InstallmentLike[] {
  const max = maxSplitCount(periodicity);
  if (max === 0 || count < 1 || count > max) return [];
  const amounts = splitAmount(amount, count);
  const day = Math.min(Math.max(startDay, 1), 28);
  return amounts.map((a, i) => {
    if (periodicity === 'WEEKLY') {
      return { monthOffset: 0, day: 1 + i * Math.floor(7 / count), amount: a };
    }
    if (periodicity === 'MONTHLY') {
      const step = Math.max(1, Math.min(7, Math.floor(28 / count)));
      const first = Math.max(1, Math.min(day, 28 - (count - 1) * step));
      return { monthOffset: 0, day: first + i * step, amount: a };
    }
    const months = periodicity === 'YEARLY' ? 12 : 3;
    return {
      monthOffset: i * Math.floor(months / count),
      day,
      amount: a,
    };
  });
}
