// lib/loyalty-checkout.ts
//
// Remises fidélité du récapitulatif de /carte/commande. Pur (partagé par le hook
// du checkout et testé).
//
// Deux remises distinctes :
//   - la récompense ACQUISE (`activeRewardCap`) : le client l'a déjà, le serveur
//     la déduit toujours à la création (`createOrder`, `loyaltyRewardId`) ;
//   - la réduction À VENIR (`upcomingCap`) : celle que CETTE commande débloquera
//     en créditant son tampon. Le serveur ne l'applique d'office qu'à la création
//     d'une commande NON payée en ligne. En paiement en ligne le tampon n'est
//     accordé qu'au paiement validé (`awardLoyaltyOnPayment`) : le montant Jèko est
//     figé à la création, sans cette réduction, qui vaut pour la commande suivante.
//     La déduire à l'écran afficherait donc un total inférieur à ce que Jèko débite.

export type CheckoutLoyaltyInput = {
  /** Total brut du panier. */
  total: number;
  /** Plafond de la récompense acquise utilisée, `null` si aucune. */
  activeRewardCap: number | null;
  /** Plafond de la réduction débloquée par cette commande, `null` si aucune. */
  upcomingCap: number | null;
  /**
   * Le serveur appliquera-t-il la réduction à venir d'office ? `false` en paiement
   * en ligne, et tant qu'on ne sait pas (chargement de la config de paiement).
   */
  deductUpcoming: boolean;
};

export type CheckoutLoyaltyDiscounts = {
  rewardDiscount: number;
  upcomingDiscount: number;
  /** Somme des deux : ce que le récapitulatif retire du total. */
  discount: number;
  netTotal: number;
};

export function checkoutLoyaltyDiscounts(
  input: CheckoutLoyaltyInput
): CheckoutLoyaltyDiscounts {
  const { total, activeRewardCap, upcomingCap, deductUpcoming } = input;
  const rewardDiscount =
    activeRewardCap !== null ? Math.min(activeRewardCap, total) : 0;
  // Une récompense acquise déjà utilisée : le serveur n'applique pas en plus
  // celle de la commande en cours (`!reward` dans `createOrder`).
  const upcomingDiscount =
    deductUpcoming && upcomingCap !== null && activeRewardCap === null
      ? Math.min(upcomingCap, total)
      : 0;
  const discount = rewardDiscount + upcomingDiscount;
  return {
    rewardDiscount,
    upcomingDiscount,
    discount,
    netTotal: Math.max(0, total - discount),
  };
}
