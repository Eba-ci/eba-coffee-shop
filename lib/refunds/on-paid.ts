// lib/refunds/on-paid.ts
//
// Passage à PAID : l'argent est parti (ou a été remis). C'est CET instant qui
// compte en comptabilité (`payoutDate`, jour civil Abidjan), pas la demande.
// Une seule transaction : statut + date + tampon + stock. Idempotent (garde sur le
// statut) : le sondage Jèko et un clic de l'admin peuvent arriver en même temps.

import prisma from '@/lib/prisma';
import type { Prisma, RefundStatus } from '@/generated/prisma/client';
import { priceFormatter } from '@/config/menu';
import { todayDailyDate } from '@/lib/daily-numbering';
import { CreditError } from '@/lib/credits/errors';
import { moveCredit } from '@/lib/credits/ledger';
import { revokeLoyaltyForOrder } from '@/lib/loyalty-mutations';
import { notifyOrderCustomer } from '@/lib/push-notify';
import { revalidatePublicMenu } from '@/lib/revalidate-public-menu';
import { getRefundCap } from './cap';
import { isFullyCovered } from './fully-refunded';
import { transitionRefund } from './events';
import { releaseHolds } from '@/lib/orders/stock-holds/holds';
import { restoreStockForRefundLines } from './lines';

export type SettlePaidArgs = {
  id: string;
  /** Statuts depuis lesquels le passage à PAID est légitime. */
  from: RefundStatus[];
  actorId: string | null;
  note?: string | null;
  jekoTransferId?: string | null;
  feeFcfa?: number;
};

/** Vrai quand les remboursements PAID couvrent tout ce qui a été encaissé. */
async function isFullyRefunded(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<boolean> {
  const { paid } = await getRefundCap(tx, orderId);
  const done = await tx.refund.aggregate({
    where: { orderId, status: 'PAID', creditSourceId: null },
    _sum: { amount: true },
  });
  return isFullyCovered(paid, done._sum.amount ?? 0);
}

/** Renvoie true si CET appel a fait passer le remboursement à PAID. */
export async function settleRefundPaid(args: SettlePaidArgs): Promise<boolean> {
  const result = await prisma.$transaction(async (tx) => {
    const moved = await transitionRefund(tx, {
      id: args.id,
      from: args.from,
      to: 'PAID',
      actorId: args.actorId,
      note: args.note,
      data: {
        paidAt: new Date(),
        payoutDate: todayDailyDate(),
        failureCode: null,
        failureMessage: null,
        ...(args.jekoTransferId ? { jekoTransferId: args.jekoTransferId } : {}),
        ...(args.feeFcfa !== undefined ? { feeFcfa: args.feeFcfa } : {}),
      },
    });
    if (!moved) return null;

    const refund = await tx.refund.findUniqueOrThrow({
      where: { id: args.id },
      include: {
        lines: true,
        order: {
          select: {
            customerId: true,
            loyaltyRewardId: true,
            stockReservedAt: true,
          },
        },
      },
    });

    // Avoir : aucun argent ne sort, le montant rejoint le solde du client (même
    // transaction que le passage à PAID : pas d'avoir sans remboursement payé).
    if (refund.delivery === 'STORE_CREDIT') {
      if (!refund.order.customerId) {
        throw new CreditError('Cette commande n’a pas de client pour l’avoir');
      }
      await moveCredit(tx, {
        customerId: refund.order.customerId,
        delta: refund.amount,
        kind: 'ISSUED',
        orderId: refund.orderId,
        refundId: refund.id,
        note: 'Avoir (remboursement)',
        actorId: args.actorId,
      });
    }

    // Un remboursement automatique de paiement tardif concerne une commande jamais
    // servie : tampon déjà retiré à l'expiration, stock jamais pris.
    const fullyRefunded = await isFullyRefunded(tx, refund.orderId);
    // Le remboursement ne modifie pas la commande, donc le trigger Postgres ne
    // sonne pas : on réveille les écrans caisse/cuisine, car une commande
    // remboursée en totalité sort de leurs files.
    if (fullyRefunded) {
      // Pas encore lancée : ses parts réservées retournent au stock.
      await releaseHolds(tx, refund.orderId, {
        actorId: args.actorId,
        refundId: refund.id,
        note: 'Remboursement total',
      });
      await tx.$executeRaw`SELECT pg_notify('orders_changed', '')`;
    }

    if (refund.source === 'STAFF' && !refund.creditSourceId) {
      if (refund.order.customerId && fullyRefunded) {
        await revokeLoyaltyForOrder(tx, {
          orderId: refund.orderId,
          customerId: refund.order.customerId,
          usedRewardId: refund.order.loyaltyRewardId,
          note: 'Remboursement total',
          actorId: args.actorId,
          keepUsedReward: true,
        });
      }
      // `stockReservedAt` nul : rien n'a jamais été décompté, rien à rendre.
      if (
        refund.restockItems &&
        !refund.stockRestoredAt &&
        refund.order.stockReservedAt
      ) {
        await restoreStockForRefundLines(tx, refund.lines, {
          orderId: refund.orderId,
          refundId: refund.id,
          actorId: args.actorId,
        });
        await tx.refund.update({
          where: { id: refund.id },
          data: { stockRestoredAt: new Date() },
        });
      }
    }
    return refund;
  });

  if (!result) return false;
  if (result.restockItems) revalidatePublicMenu();
  notifyOrderCustomer(
    result.orderId,
    'REFUNDED',
    result.delivery === 'STORE_CREDIT'
      ? `Ton avoir de ${priceFormatter.format(result.amount)} F est disponible : il s’appliquera à ta prochaine commande.`
      : `Ton remboursement de ${priceFormatter.format(result.amount)} F est parti${
          result.delivery === 'JEKO_TRANSFER' ? ' sur ton numéro' : ''
        }.`
  );
  return true;
}
