import prisma from '@/lib/prisma';
import { getLoyaltySettings } from '@/lib/loyalty-settings-db';
import { computeStampAward, type EarnedReward } from '@/lib/loyalty-compute';
import { loyaltyFreezeReason, loyaltyFrozenMessage } from '../active';

/**
 * Refuse une correction manuelle de tampons quand la fidélité est gelée
 * (programme ou client désactivé) : un compteur qui bouge sous le gel se
 * retrouverait faussé à la réactivation. Le message dit quoi réactiver.
 */
async function assertLoyaltyActive(customer: { loyaltyDisabled: boolean }) {
  const reason = loyaltyFreezeReason(await getLoyaltySettings(), customer);
  if (reason) throw new Error(loyaltyFrozenMessage(reason));
}

/** Ajustement manuel (admin) du compteur de tampons. */
export async function adjustStamps(
  customerId: string,
  delta: number,
  note?: string | null,
  actorId?: string | null
): Promise<number> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { stampCount: true, loyaltyDisabled: true },
  });
  if (!customer) throw new Error('Client introuvable');
  await assertLoyaltyActive(customer);

  const next = Math.max(0, customer.stampCount + delta);
  await prisma.$transaction([
    prisma.customer.update({
      where: { id: customerId },
      data: { stampCount: next },
    }),
    prisma.loyaltyLedger.create({
      data: {
        customerId,
        type: 'ADJUSTMENT',
        stamps: delta,
        note: note ?? null,
        actorId: actorId ?? null,
      },
    }),
  ]);
  return next;
}

export async function awardMissedOrderStamps(
  customerId: string,
  count: number,
  note?: string | null,
  actorId?: string | null
): Promise<{ stampCount: number; rewardsCreated: number }> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { stampCount: true, loyaltyDisabled: true },
  });
  if (!customer) throw new Error('Client introuvable');
  await assertLoyaltyActive(customer);

  const settings = await getLoyaltySettings();

  let stampCount = customer.stampCount;
  const rewards: EarnedReward[] = [];
  for (let i = 0; i < count; i++) {
    const result = computeStampAward(stampCount, settings);
    stampCount = result.newStampCount;
    rewards.push(...result.rewards);
  }

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: { stampCount },
    });
    await tx.loyaltyLedger.create({
      data: {
        customerId,
        type: 'ADJUSTMENT',
        stamps: count,
        note: note ?? null,
        actorId: actorId ?? null,
      },
    });
    for (const r of rewards) {
      await tx.loyaltyReward.create({
        data: {
          customerId,
          tier: r.tier,
          capAmount: r.capAmount,
        },
      });
      await tx.loyaltyLedger.create({
        data: {
          customerId,
          type: 'REWARD_EARNED',
          actorId: actorId ?? null,
          note: `Palier ${r.tier} — ${r.capAmount} F (rattrapage commande manquée)`,
        },
      });
    }
  });

  return { stampCount, rewardsCreated: rewards.length };
}
