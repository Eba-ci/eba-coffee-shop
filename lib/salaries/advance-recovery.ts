// lib/salaries/advance-recovery.ts
//
// Garde-fou de modification d'une AVANCE : on ne peut pas réduire son montant
// sous ce qui a DÉJÀ été récupéré. Le montant récupéré « avant » un mois est la
// somme des parts d'étalement dont le mois de récupération est strictement
// antérieur — le mois en cours n'est pas compté (sa paie peut ne pas être
// faite). Pur, sans base : testable directement.

import { advanceRecoverySchedule } from './ledger';
import type { AdvanceLike } from './types';

/**
 * Montant d'une avance déjà récupéré avant `month` (mois exclus). C'est la
 * borne basse d'un ajustement de montant : réduire en dessous laisserait une
 * avance « remboursée » plus que prêtée.
 */
export function advanceRecoveredBefore(
  advance: AdvanceLike,
  month: string
): number {
  return advanceRecoverySchedule(advance)
    .filter((r) => r.month < month)
    .reduce((a, r) => a + r.amount, 0);
}
