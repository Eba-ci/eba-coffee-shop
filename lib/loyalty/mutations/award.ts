import { Prisma } from '@/generated/prisma/client';
import { todayDailyDate } from '@/lib/daily-numbering';
import { loyaltySettingsFromRow } from '@/lib/loyalty-settings';
import { computeStampAward, type EarnedReward } from '@/lib/loyalty-compute';

export type AwardArgs = {
  customerId: string;
  orderId: string;
  orderTotal: number;
  /** Utilisateur à l'origine (caisse) ; null pour une commande en ligne. */
  actorId?: string | null;
};

/** Récompense (palier) débloquée par une commande, avec l'id de la ligne créée. */
export type EarnedRewardRow = EarnedReward & { id: string };

/** Attribue (au plus) 1 tampon pour une commande, et crée les récompenses débloquées. */
export async function awardLoyaltyForOrder(
  tx: Prisma.TransactionClient,
  { customerId, orderId, orderTotal, actorId }: AwardArgs
): Promise<{ rewards: EarnedRewardRow[] }> {
  const settings = loyaltySettingsFromRow(
    await tx.loyaltySettings.findUnique({ where: { id: 'singleton' } })
  );
  if (!settings.enabled) return { rewards: [] };
  if (orderTotal < settings.minOrderAmount) return { rewards: [] };

  await tx.$queryRaw`SELECT "id" FROM "customer" WHERE "id" = ${customerId} FOR UPDATE`;

  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { stampCount: true, lastStampDate: true, loyaltyDisabled: true },
  });
  if (!customer) return { rewards: [] };
  // Fidélité désactivée pour CE client : gelé, aucun tampon ni récompense (le
  // verrou ci-dessus rend la lecture du drapeau cohérente avec une réactivation
  // concurrente). Même retour muet que le garde global : les appelants
  // (création, Jèko, restauration) n'ont rien à gérer.
  if (customer.loyaltyDisabled) return { rewards: [] };

  const today = todayDailyDate();
  if (
    settings.oneStampPerDay &&
    customer.lastStampDate &&
    customer.lastStampDate.getTime() === today.getTime()
  ) {
    return { rewards: [] }; // déjà un tampon aujourd'hui
  }

  const { newStampCount, rewards } = computeStampAward(
    customer.stampCount,
    settings
  );

  await tx.customer.update({
    where: { id: customerId },
    data: { stampCount: newStampCount, lastStampDate: today },
  });
  await tx.loyaltyLedger.create({
    data: {
      customerId,
      type: 'STAMP_EARNED',
      stamps: 1,
      orderId,
      actorId: actorId ?? null,
    },
  });

  const createdRewards: EarnedRewardRow[] = [];
  for (const r of rewards) {
    const created = await tx.loyaltyReward.create({
      data: {
        customerId,
        tier: r.tier,
        capAmount: r.capAmount,
        earnedOrderId: orderId,
      },
    });
    createdRewards.push({
      tier: r.tier,
      capAmount: r.capAmount,
      id: created.id,
    });
    await tx.loyaltyLedger.create({
      data: {
        customerId,
        type: 'REWARD_EARNED',
        orderId,
        actorId: actorId ?? null,
        note: `Palier ${r.tier} — ${r.capAmount} F`,
      },
    });
  }

  return { rewards: createdRewards };
}
