// lib/loyalty/active.ts
//
// La fidélité est-elle ACTIVE pour un client ? Source unique de la règle de gel.
//
// Deux interrupteurs, un seul effet — tout est GELÉ, rien n'est effacé :
//   - global : `LoyaltySettings.enabled` (Paramètres → Fidélité) ;
//   - client : `Customer.loyaltyDisabled` (fiche client).
// Gelé = plus de gain de tampon, plus d'affichage (checkout, caisse, suivi) et plus
// d'usage d'une récompense déjà acquise. Tampons et récompenses restent en base et
// reviennent tels quels à la réactivation. Les retraits (annulation, remboursement,
// expiration) continuent : ils défont ce qui avait été gagné.

export type LoyaltyFreezeReason = 'program' | 'customer';

/** Pourquoi la fidélité est gelée, ou `null` si elle est active. Le programme prime. */
export function loyaltyFreezeReason(
  settings: { enabled: boolean },
  customer: { loyaltyDisabled: boolean } | null
): LoyaltyFreezeReason | null {
  if (!settings.enabled) return 'program';
  if (customer?.loyaltyDisabled) return 'customer';
  return null;
}

export function isLoyaltyActive(
  settings: { enabled: boolean },
  customer: { loyaltyDisabled: boolean } | null
): boolean {
  return loyaltyFreezeReason(settings, customer) === null;
}

/** Message affiché à une personne du staff qui tente une opération gelée. */
export function loyaltyFrozenMessage(reason: LoyaltyFreezeReason): string {
  return reason === 'program'
    ? 'La fidélité est désactivée pour toute l’application (Paramètres → Fidélité). Réactivez-la d’abord.'
    : 'La fidélité est désactivée pour ce client. Réactivez-la d’abord sur sa fiche.';
}
