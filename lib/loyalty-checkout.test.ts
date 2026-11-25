import { describe, it, expect } from 'vitest';
import { checkoutLoyaltyDiscounts } from './loyalty-checkout';
import { computeUpcomingRewardMessage } from './loyalty-messaging';

describe('checkoutLoyaltyDiscounts', () => {
  const base = {
    total: 3000,
    activeRewardCap: null,
    upcomingCap: 1000,
  };

  it('paiement en ligne : ne déduit PAS la réduction débloquée par cette commande', () => {
    // Le serveur n'accorde le tampon qu'au paiement : Jèko débitera 3000 F + frais.
    const r = checkoutLoyaltyDiscounts({ ...base, deductUpcoming: false });
    expect(r).toEqual({
      rewardDiscount: 0,
      upcomingDiscount: 0,
      discount: 0,
      netTotal: 3000,
    });
  });

  it('hors paiement en ligne : la réduction à venir est déduite d’office', () => {
    const r = checkoutLoyaltyDiscounts({ ...base, deductUpcoming: true });
    expect(r.upcomingDiscount).toBe(1000);
    expect(r.netTotal).toBe(2000);
  });

  it('une récompense acquise est déduite dans tous les cas', () => {
    for (const deductUpcoming of [true, false]) {
      const r = checkoutLoyaltyDiscounts({
        total: 3000,
        activeRewardCap: 1000,
        upcomingCap: 1000,
        deductUpcoming,
      });
      expect(r.rewardDiscount).toBe(1000);
      // Pas de cumul avec la réduction de la commande en cours.
      expect(r.upcomingDiscount).toBe(0);
      expect(r.netTotal).toBe(2000);
    }
  });

  it('plafonne les remises au total du panier', () => {
    expect(
      checkoutLoyaltyDiscounts({
        total: 600,
        activeRewardCap: 1000,
        upcomingCap: null,
        deductUpcoming: false,
      })
    ).toMatchObject({ rewardDiscount: 600, netTotal: 0 });
    expect(
      checkoutLoyaltyDiscounts({
        total: 600,
        activeRewardCap: null,
        upcomingCap: 1000,
        deductUpcoming: true,
      })
    ).toMatchObject({ upcomingDiscount: 600, netTotal: 0 });
  });

  it('sans remise : total inchangé', () => {
    expect(
      checkoutLoyaltyDiscounts({
        total: 2500,
        activeRewardCap: null,
        upcomingCap: null,
        deductUpcoming: true,
      })
    ).toEqual({
      rewardDiscount: 0,
      upcomingDiscount: 0,
      discount: 0,
      netTotal: 2500,
    });
  });
});

describe('computeUpcomingRewardMessage', () => {
  it('hors paiement en ligne : annonce une réduction déjà déduite', () => {
    expect(computeUpcomingRewardMessage(1000)).toContain('déjà déduits');
  });

  it('en paiement en ligne : annonce la réduction pour la prochaine commande, sans prétendre l’avoir déduite', () => {
    const msg = computeUpcomingRewardMessage(1000, { online: true });
    expect(msg).not.toContain('déduit');
    expect(msg).toContain('prochaine commande');
    expect(msg).toContain('1');
  });
});
