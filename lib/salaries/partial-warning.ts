// lib/salaries/partial-warning.ts
//
// Avertissement NON BLOQUANT avant un versement (#446). Fonction pure : elle
// reçoit la situation DÉJÀ calculée par le journal (`remainingToPay` du mois,
// arriéré des mois clôturés) et ne recalcule jamais le ledger. Le reliquat est
// `reste − montant`, la même soustraction que `remainingToPay` après le
// versement (un SALAIRE s'impute tel quel sur le reste du mois) : le test de
// cohérence le vérifie contre `salaryLedgerThrough`.

export type PaymentSituation = {
  /** Reste à payer du mois concerné (`remainingToPay` du journal). */
  remaining: number;
  /** Arriéré des mois clôturés, mois concerné exclu. */
  arrears: number;
};

export type PaymentWarning =
  /** Montant < reste du mois : il restera `unpaid` F d'impayé. */
  | { kind: 'partial'; unpaid: number; arrears: number }
  /** Montant > reste du mois : `excess` F au-delà du dû. */
  | { kind: 'excess'; excess: number; arrears: number }
  /** Rien à payer ce mois mais un arriéré : on règle une dette. */
  | { kind: 'arrears-only'; arrears: number; excess: number }
  /** Aucun dû ni arriéré : tout le montant est un excédent. */
  | { kind: 'nothing-due'; excess: number };

/** `null` = aucun message (montant vide/invalide, ou égal au reste du mois). */
export function salaryPaymentWarning(
  amount: number,
  situation: PaymentSituation
): PaymentWarning | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const { remaining, arrears } = situation;
  if (remaining <= 0 && arrears <= 0) {
    return { kind: 'nothing-due', excess: amount };
  }
  if (remaining <= 0) return { kind: 'arrears-only', arrears, excess: amount };
  if (amount < remaining) {
    return { kind: 'partial', unpaid: remaining - amount, arrears };
  }
  if (amount > remaining) {
    return { kind: 'excess', excess: amount - remaining, arrears };
  }
  return null;
}
