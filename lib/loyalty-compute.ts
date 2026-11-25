// lib/loyalty-compute.ts
//
// Logique pure de la carte à tampons (sans Prisma) — testable et partagée.
//
//   - +1 tampon par commande éligible (la décision « éligible » est gérée en
//     amont : montant min, 1/jour, programme actif) ;
//   - récompense au palier intermédiaire (`tier1Stamps`) et au palier final
//     (`stampsPerCard`) ; après le palier final la carte revient à 0.

export type LoyaltyConfig = {
  stampsPerCard: number;
  tier1Stamps: number;
  tier1RewardCap: number;
  tier2RewardCap: number;
};

export type EarnedReward = { tier: number; capAmount: number };

export type AwardResult = {
  /** Nouvel avancement de la carte (0..stampsPerCard-1 après reset). */
  newStampCount: number;
  /** Récompenses débloquées par ce tampon (0, 1 ou 2 entrées). */
  rewards: EarnedReward[];
};

/**
 * Applique 1 tampon à `currentStampCount` et renvoie le nouvel avancement +
 * les récompenses débloquées.
 */
export function computeStampAward(
  currentStampCount: number,
  cfg: LoyaltyConfig
): AwardResult {
  let count = currentStampCount + 1;
  const rewards: EarnedReward[] = [];

  if (
    cfg.tier1Stamps > 0 &&
    cfg.tier1Stamps < cfg.stampsPerCard &&
    count === cfg.tier1Stamps
  ) {
    rewards.push({ tier: cfg.tier1Stamps, capAmount: cfg.tier1RewardCap });
  }

  if (count >= cfg.stampsPerCard) {
    rewards.push({ tier: cfg.stampsPerCard, capAmount: cfg.tier2RewardCap });
    count = 0; // nouvelle carte
  }

  return { newStampCount: count, rewards };
}

/**
 * Inverse de `computeStampAward` pour UN tampon : retire le tampon d'une
 * commande annulée. Si ce tampon avait bouclé la carte (retour à 0), on
 * revient à l'avant-dernière case — le client retrouve exactement la carte
 * qu'il avait avant de commander. Jamais négatif.
 */
export function computeStampRevert(
  currentStampCount: number,
  cfg: Pick<LoyaltyConfig, 'stampsPerCard'>
): number {
  if (currentStampCount > 0) return currentStampCount - 1;
  return Math.max(0, cfg.stampsPerCard - 1);
}

/**
 * Récompense que la commande en cours débloquera en créditant son tampon
 * (appliquée d'office par le serveur à la création, SAUF en paiement en ligne où
 * le tampon n'est accordé qu'au paiement : elle vaut alors pour la suivante) —
 * `null` si aucune.
 * Miroir en lecture seule de `awardLoyaltyForOrder` : mêmes conditions
 * (programme actif, total >= minimum, 1 tampon/jour) pour que l'aperçu du
 * récapitulatif corresponde exactement à ce que le serveur appliquera.
 */
export function computeUpcomingReward(params: {
  stampCount: number;
  lastStampDate: Date | null;
  today: Date;
  /** Total de la commande tel que testé par `awardLoyaltyForOrder` (net). */
  cartTotal: number;
  settings: LoyaltyConfig & {
    enabled: boolean;
    minOrderAmount: number;
    oneStampPerDay: boolean;
  };
}): { capAmount: number } | null {
  const { stampCount, lastStampDate, today, cartTotal, settings } = params;
  if (!settings.enabled || cartTotal < settings.minOrderAmount) return null;
  if (
    settings.oneStampPerDay &&
    lastStampDate &&
    lastStampDate.getTime() === today.getTime()
  ) {
    return null;
  }
  const reward = computeStampAward(stampCount, settings).rewards[0];
  return reward ? { capAmount: reward.capAmount } : null;
}

/**
 * Réduction à venir pour un total donné, à partir de ce que la caisse a déjà
 * en main (`nextStampReward` : récompense que le prochain tampon débloquera,
 * déjà filtrée par la règle 1 tampon/jour). `netTotal` = total après une
 * récompense déjà acquise, comme testé par `awardLoyaltyForOrder`.
 */
export function upcomingRewardDiscount(
  card: {
    nextStampReward: { capAmount: number } | null;
    minOrderAmount: number;
  } | null,
  netTotal: number
): number {
  if (!card?.nextStampReward || netTotal < card.minOrderAmount) return 0;
  return Math.min(card.nextStampReward.capAmount, netTotal);
}
