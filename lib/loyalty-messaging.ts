// lib/loyalty-messaging.ts
//
// Textes marketing fidélité — deux moments distincts, jamais la même chose sur
// une même commande :
//   - `computeCheckoutLoyaltyMessage` (avant paiement) = INCITATIF. Le tampon
//     n'existe pas encore, toujours au conditionnel ou en upsell.
//   - `computePickupMessage` (commande prête, après paiement) = CONFIRMATION.
//     Le tampon est réellement acquis, le message peut affirmer le gain.
//
// Fonctions pures (aucun accès DB) : les appelants résolvent `stampCount` /
// `settings` / l'issue fidélité de la commande, ci-dessous on ne fait que
// choisir le bon texte.

import { priceFormatter } from '@/config/menu';
import type { LoyaltySettings } from '@/lib/loyalty-settings';

function fmt(amount: number): string {
  return priceFormatter.format(amount);
}

/**
 * Message affiché AVANT paiement (récapitulatif de commande / panier) : upsell
 * si sous le seuil, incitation à valider si au-dessus. Jamais d'affirmation
 * d'un gain acquis — le tampon ne sera attribué qu'au paiement.
 *
 * `stampCount === stampsPerCard` n'arrive jamais en pratique : la carte se
 * réinitialise à 0 dans le même calcul qui l'atteint (`computeStampAward`).
 */
export function computeCheckoutLoyaltyMessage(params: {
  cartTotal: number;
  stampCount: number;
  settings: LoyaltySettings;
}): string {
  const { cartTotal, stampCount } = params;
  const {
    minOrderAmount,
    tier1Stamps,
    stampsPerCard,
    tier1RewardCap,
    tier2RewardCap,
  } = params.settings;

  if (cartTotal < minOrderAmount) {
    const missingAmount = minOrderAmount - cartTotal;
    if (stampCount === 0) {
      return `🎁 Encore ${fmt(missingAmount)} F et tu débloques ton 1er tampon fidélité EBA — objectif jusqu'à ${fmt(tier1RewardCap)} F 💛`;
    }
    return `☕ Tu as déjà ${stampCount}/${tier1Stamps} tampons — encore ${fmt(missingAmount)} F sur cette commande pour en ajouter un de plus.`;
  }

  // cartTotal >= minOrderAmount : le seuil est franchi, reste à valider.
  if (stampCount === 0) {
    return `🎁 Petit bonus : valide ta commande et débloque ton 1er tampon fidélité EBA — objectif jusqu'à ${fmt(tier1RewardCap)} F 💛`;
  }

  if (stampCount < tier1Stamps) {
    const remaining = tier1Stamps - stampCount;
    if (remaining === 1) {
      return `🎁 Encore un pas ! Valide cette commande et débloque ta réduction jusqu'à ${fmt(tier1RewardCap)} F ☕`;
    }
    return `☕ Tu as déjà ${stampCount}/${tier1Stamps} tampons — valide cette commande pour continuer vers ta réduction jusqu'à ${fmt(tier1RewardCap)} F.`;
  }

  // tier1Stamps <= stampCount < stampsPerCard
  const remaining = stampsPerCard - stampCount;
  if (remaining === 1) {
    return `🎁 Valide cette commande et débloque ta grande réduction jusqu'à ${fmt(tier2RewardCap)} F 💛`;
  }
  return `☕ ${stampCount}/${stampsPerCard} tampons en poche — valide pour continuer vers ta grande réduction jusqu'à ${fmt(tier2RewardCap)} F.`;
}

/**
 * Message AVANT paiement quand cette commande débloque une récompense.
 *
 * Hors paiement en ligne, le serveur l'applique d'office à la création : le
 * récapitulatif l'annonce déjà déduite. En paiement en ligne, le tampon n'est
 * accordé qu'au paiement validé et le montant Jèko est figé sans cette réduction :
 * on l'annonce pour la commande SUIVANTE, sans dire qu'elle est déduite.
 */
export function computeUpcomingRewardMessage(
  capAmount: number,
  opts: { online?: boolean } = {}
): string {
  if (opts.online) {
    return `🎁 Cette commande te fait gagner une réduction fidélité de ${fmt(capAmount)} F, à utiliser sur ta prochaine commande 💛`;
  }
  return `🎁 Cette commande te fait gagner ta réduction fidélité : jusqu'à ${fmt(capAmount)} F déjà déduits de ton total 💛`;
}

export const PICKUP_GENERIC_MESSAGE =
  '✅ Ta commande est prête, passe la récupérer !';

/**
 * Message affiché à la remise (commande prête), après paiement : confirmation
 * de retrait, combinée à la reconnaissance fidélité si cette commande a
 * effectivement crédité un tampon (sinon silence pur sur le sujet — jamais de
 * "pas de tampon cette fois").
 *
 * `stampCount` doit être le compteur du client APRÈS l'ajout du tampon de
 * cette commande. `stampCount === 0` avec `stampEarned === true` signale que
 * la carte vient de se réinitialiser (grande récompense tout juste débloquée
 * par cette commande) — cas non couvert explicitement par la spec d'origine
 * mais déductible : un tampon qui ramène le compteur à 0 ne peut être qu'un
 * passage à `stampsPerCard`.
 */
export function computePickupMessage(params: {
  settings: LoyaltySettings;
  stampEarned: boolean;
  isFirstStampEver: boolean;
  stampCount: number;
}): string {
  const { settings, stampEarned, isFirstStampEver, stampCount } = params;
  if (!settings.enabled || !stampEarned) return PICKUP_GENERIC_MESSAGE;

  const { tier1Stamps, stampsPerCard, tier1RewardCap, tier2RewardCap } =
    settings;

  if (isFirstStampEver) {
    return `✅ Ta commande est prête, passe la récupérer ! 🎁 Petit bonus au passage : c'est ton 1er tampon fidélité EBA — encore ${tier1Stamps} et jusqu'à ${fmt(tier1RewardCap)} F sont à toi 💛`;
  }

  if (stampCount === 0) {
    return `✅ Ta commande est prête ! 🎉 Et en prime : tu viens de débloquer ta grande réduction fidélité jusqu'à ${fmt(tier2RewardCap)} F — ta carte repart à 0, prête pour un nouveau tour ☕`;
  }

  if (stampCount < tier1Stamps) {
    const remaining = tier1Stamps - stampCount;
    if (remaining === 1) {
      return `✅ Ta commande t'attend au comptoir ! 🎁 Plus qu'une commande pour ta réduction jusqu'à ${fmt(tier1RewardCap)} F — on te la garde au chaud ☕`;
    }
    return `✅ C'est prêt, à tout de suite ! ☕ Tampon ${stampCount}/${tier1Stamps} en poche — encore ${remaining} commandes et jusqu'à ${fmt(tier1RewardCap)} F sont à toi.`;
  }

  // stampCount >= tier1Stamps, < stampsPerCard
  const remaining = stampsPerCard - stampCount;
  if (remaining === 1) {
    return `✅ Ta commande est prête ! 🎁 Une dernière commande et ta grande réduction jusqu'à ${fmt(tier2RewardCap)} F est débloquée. On t'attend ☕`;
  }
  if (stampCount === tier1Stamps) {
    return `✅ Prêt à récupérer ! 🎁 Ta première réduction, c'est fait 💛 Nouveau tampon ${stampCount}/${stampsPerCard} — encore ${remaining} pour ta grande réduction jusqu'à ${fmt(tier2RewardCap)} F.`;
  }
  return `✅ C'est prêt, à tout de suite ! ☕ Tampon ${stampCount}/${stampsPerCard} en poche — encore ${remaining} commandes et jusqu'à ${fmt(tier2RewardCap)} F sont à toi.`;
}
