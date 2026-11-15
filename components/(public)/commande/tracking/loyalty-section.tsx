import { Gift } from 'lucide-react';
import type { PublicOrderLoyaltyView } from '@/lib/orders';
import { priceFormatter } from '@/config/menu';

export function LoyaltySection({
  loyalty,
}: {
  loyalty: PublicOrderLoyaltyView;
}) {
  const {
    stampCount,
    stampsPerCard,
    tier1Stamps,
    tier1RewardCap,
    tier2RewardCap,
    minOrderAmount,
    availableRewardsCount,
    isFirstOrder,
  } = loyalty;

  const reachedTier1 = stampCount >= tier1Stamps;
  const nextTarget = reachedTier1 ? stampsPerCard : tier1Stamps;
  const nextCap = reachedTier1 ? tier2RewardCap : tier1RewardCap;
  const remaining = Math.max(0, nextTarget - stampCount);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground/40">
          <Gift className="h-4 w-4" />
          Ta fidélité
        </p>
        <span className="text-xs font-medium text-foreground/50">
          {stampCount}/{stampsPerCard} tampons
        </span>
      </div>

      {availableRewardsCount > 0 ? (
        <p className="mt-3 text-sm font-medium text-primary">
          🎁 Tu as {availableRewardsCount} réduction
          {availableRewardsCount > 1 ? 's' : ''} prête
          {availableRewardsCount > 1 ? 's' : ''} à utiliser — elle s’applique
          toute seule à ta prochaine commande en ligne (ou montre cette page au
          comptoir).
        </p>
      ) : isFirstOrder ? (
        <p className="mt-3 text-sm text-foreground/70">
          Merci pour ta première commande chez EBA&nbsp;! 🎉{' '}
          {stampCount > 0
            ? 'Tu viens de gagner ton premier tampon fidélité — encore quelques commandes et une réduction t’attend.'
            : `Dès ${priceFormatter.format(minOrderAmount)} FCFA d’achat, chaque commande payée te fait gagner un tampon fidélité.`}
        </p>
      ) : (
        <p className="mt-3 text-sm text-foreground/70">
          Plus que {remaining} commande{remaining > 1 ? 's' : ''} pour ta
          réduction (jusqu’à {priceFormatter.format(nextCap)} FCFA)&nbsp;!
        </p>
      )}
    </div>
  );
}
