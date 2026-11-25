import { Prisma } from '@/generated/prisma/client';
import { loyaltySettingsFromRow } from '@/lib/loyalty-settings';
import { loyaltyFreezeReason } from '../active';
import { LoyaltyRewardUnavailableError } from './errors';

export async function resolveLoyaltyReward(
  tx: Prisma.TransactionClient,
  rewardId: string,
  customerId: string | null
): Promise<{ id: string; capAmount: number }> {
  if (!customerId) {
    throw new LoyaltyRewardUnavailableError(
      'Récompense fidélité : aucun client associé à la commande'
    );
  }
  // Fidélité gelée (programme ou client désactivé) : une récompense déjà acquise
  // n'est plus utilisable — elle reste en base et revient à la réactivation.
  // Point de passage commun à la commande publique, à la caisse et à l'édition.
  const [settingsRow, owner] = await Promise.all([
    tx.loyaltySettings.findUnique({ where: { id: 'singleton' } }),
    tx.customer.findUnique({
      where: { id: customerId },
      select: { loyaltyDisabled: true },
    }),
  ]);
  if (loyaltyFreezeReason(loyaltySettingsFromRow(settingsRow), owner)) {
    throw new LoyaltyRewardUnavailableError(
      'Fidélité désactivée : la récompense ne peut pas être utilisée'
    );
  }
  const found = await tx.loyaltyReward.findUnique({
    where: { id: rewardId },
    select: { id: true, customerId: true, capAmount: true, status: true },
  });
  if (
    !found ||
    found.customerId !== customerId ||
    found.status !== 'AVAILABLE'
  ) {
    throw new LoyaltyRewardUnavailableError();
  }
  return { id: found.id, capAmount: found.capAmount };
}

export async function consumeLoyaltyReward(
  tx: Prisma.TransactionClient,
  args: {
    rewardId: string;
    customerId: string;
    orderId: string;
    capAmount: number;
    /** Utilisateur caisse à l'origine ; null pour une commande en ligne. */
    actorId?: string | null;
    redeemedAsGift?: boolean;
  }
): Promise<void> {
  await tx.loyaltyReward.update({
    where: { id: args.rewardId },
    data: {
      status: 'USED',
      usedOrderId: args.orderId,
      usedAt: new Date(),
      redeemedAsGift: args.redeemedAsGift ?? false,
    },
  });
  await tx.loyaltyLedger.create({
    data: {
      customerId: args.customerId,
      type: 'REWARD_USED',
      orderId: args.orderId,
      actorId: args.actorId ?? null,
      note: args.redeemedAsGift
        ? `Récompense ${args.capAmount} F offerte en cadeau (sans réduction)`
        : `Récompense ${args.capAmount} F utilisée`,
    },
  });
}
