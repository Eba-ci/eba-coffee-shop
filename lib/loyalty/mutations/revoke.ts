import { Prisma } from '@/generated/prisma/client';
import { todayDailyDate } from '@/lib/daily-numbering';
import { loyaltySettingsFromRow } from '@/lib/loyalty-settings';
import { computeStampRevert } from '@/lib/loyalty-compute';
import { awardLoyaltyForOrder } from './award';

/** Solde de tampons tracé au ledger pour UNE commande (+1 à l'attribution, −1 à chaque retrait). */
export async function orderStampBalance(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<{ net: number; everEarned: boolean }> {
  const rows = await tx.loyaltyLedger.findMany({
    where: { orderId, type: { in: ['STAMP_EARNED', 'ADJUSTMENT'] } },
    select: { type: true, stamps: true },
  });
  return {
    net: rows.reduce((sum, r) => sum + r.stamps, 0),
    everEarned: rows.some((r) => r.type === 'STAMP_EARNED'),
  };
}

export async function revokeLoyaltyForOrder(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    customerId: string;
    /** Récompense appliquée à la commande (`Order.loyaltyRewardId`). */
    usedRewardId: string | null;
    note: string;
    actorId?: string | null;
    keepUsedReward?: boolean;
  }
): Promise<void> {
  const { orderId, customerId, note } = args;
  const actorId = args.actorId ?? null;

  const earned = await tx.loyaltyReward.findMany({
    where: { earnedOrderId: orderId },
    select: { id: true, status: true, usedOrderId: true, capAmount: true },
  });
  const earnedIds = new Set(earned.map((r) => r.id));

  // 1. Récompense utilisée sur cette commande (et non débloquée par elle).
  if (
    !args.keepUsedReward &&
    args.usedRewardId &&
    !earnedIds.has(args.usedRewardId)
  ) {
    await tx.loyaltyReward.update({
      where: { id: args.usedRewardId },
      data: {
        status: 'AVAILABLE',
        usedOrderId: null,
        usedAt: null,
        redeemedAsGift: false,
      },
    });
    await tx.loyaltyLedger.create({
      data: {
        customerId,
        type: 'ADJUSTMENT',
        orderId,
        actorId,
        note: `${note} — récompense restituée`,
      },
    });
  }

  // 2. Récompenses débloquées par cette commande.
  for (const r of earned) {
    const usedElsewhere =
      r.status === 'USED' &&
      r.usedOrderId !== null &&
      r.usedOrderId !== orderId;
    const keptOnThisOrder =
      args.keepUsedReward && r.status === 'USED' && r.usedOrderId === orderId;
    if (keptOnThisOrder) continue;
    if (usedElsewhere) {
      await tx.loyaltyLedger.create({
        data: {
          customerId,
          type: 'ADJUSTMENT',
          orderId,
          actorId,
          note: `${note} — récompense ${r.capAmount} F déjà utilisée sur une autre commande, conservée`,
        },
      });
      continue;
    }
    await tx.loyaltyReward.delete({ where: { id: r.id } });
    await tx.loyaltyLedger.create({
      data: {
        customerId,
        type: 'ADJUSTMENT',
        orderId,
        actorId,
        note: `${note} — récompense ${r.capAmount} F retirée`,
      },
    });
  }

  // 3. Tampon gagné par cette commande — seulement s'il est encore compté.
  const { net } = await orderStampBalance(tx, orderId);
  if (net > 0) {
    const [customer, settingsRow] = await Promise.all([
      tx.customer.findUnique({
        where: { id: customerId },
        select: { stampCount: true, lastStampDate: true },
      }),
      tx.loyaltySettings.findUnique({ where: { id: 'singleton' } }),
    ]);
    if (customer) {
      const settings = loyaltySettingsFromRow(settingsRow);
      const today = todayDailyDate();
      await tx.customer.update({
        where: { id: customerId },
        data: {
          stampCount: computeStampRevert(customer.stampCount, settings),
          ...(customer.lastStampDate?.getTime() === today.getTime()
            ? { lastStampDate: null }
            : {}),
        },
      });
      await tx.loyaltyLedger.create({
        data: {
          customerId,
          type: 'ADJUSTMENT',
          stamps: -1,
          orderId,
          actorId,
          note,
        },
      });
    }
  }
}

export async function restoreLoyaltyForOrder(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    customerId: string;
    orderTotal: number;
    actorId?: string | null;
  }
): Promise<void> {
  const { net, everEarned } = await orderStampBalance(tx, args.orderId);
  if (net > 0) return;
  if (!everEarned) {
    // Commande en ligne payée mais jamais créditée : le tampon n'est accordé
    // qu'au paiement validé, et une commande annulée par une personne avant ce
    // paiement n'en a donc jamais eu. À sa reprise, il lui revient.
    // staff-visibility: exempt — lecture d'état de paiement d'une commande reprise
    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      select: { isPaid: true, onlineFee: true },
    });
    if (!order?.isPaid || order.onlineFee === null) return;
  }
  await awardLoyaltyForOrder(tx, {
    customerId: args.customerId,
    orderId: args.orderId,
    orderTotal: args.orderTotal,
    actorId: args.actorId ?? null,
  });
}
