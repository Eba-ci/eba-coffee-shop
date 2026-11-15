// lib/jeko/settle-late.ts
//
// Paiement Jèko arrivé APRÈS l'expiration de la commande (annulée par
// `expirePendingOrders`, qui laisse `paymentExpiresAt` renseigné — une annulation
// par le staff ou le client, elle, le remet à nul). Le client a payé, il faut
// trancher :
//   - le stock suit  → on rétablit la commande et on la valide (cuisine) ;
//   - sinon          → remboursement immédiat (lib/jeko/refund.ts).
// La fidélité et l'avoir ont déjà été restitués à l'expiration : ressusciter une
// commande qui avait consommé une récompense (ou un avoir) la reconsommerait à
// l'aveugle, on rembourse aussi.

import prisma from '@/lib/prisma';
import {
  OrderMutationError,
  StockShortageError,
  getOrderShortage,
  setOrderPayment,
} from '@/lib/order-mutations';
import { isDeferredPickup } from '@/lib/orders/scheduling';
import type { OrderPaymentLineInput } from '@/lib/schemas/order';
import { awardLoyaltyOnPayment } from './loyalty-on-paid';
import { announcePaidOrder } from './notify-paid';
import { refundLatePayment, type RefundableOrder } from './refund';
import { settledElsewhere } from './settle-alerts';
import type { SettleOutcome } from './settle';
import type { JekoTransaction } from './webhook-payload';

export type LateOrder = RefundableOrder & {
  status: string;
  paymentExpiresAt: Date | null;
  paymentTransactionId: string | null;
  loyaltyRewardId: string | null;
  pickupTime: Date | null;
  paymentCreditPart: number;
};

/** Annulée par l'expiration du délai de paiement (et non par une personne). */
export function isExpiredCancellation(order: {
  status: string;
  paymentExpiresAt?: Date | null;
}): boolean {
  return order.status === 'CANCELLED' && order.paymentExpiresAt != null;
}

async function refundReason(order: LateOrder): Promise<string | null> {
  if (order.loyaltyRewardId) return 'récompense fidélité déjà restituée';
  // Avoir retenu pour cette commande (part figée avec le montant dû), rendu
  // à l'expiration : le ressusciter le redébiterait à l'aveugle.
  if (order.paymentCreditPart > 0) return 'avoir déjà restitué';
  // Une commande différée ne touche pas au stock du jour.
  if (isDeferredPickup(order.pickupTime, new Date())) return null;
  return (await getOrderShortage(order.id)).length > 0
    ? 'stock insuffisant'
    : null;
}

export async function settleLatePayment(
  order: LateOrder,
  tx: JekoTransaction,
  lines: OrderPaymentLineInput[],
  online: {
    gatewayFee: number;
    paymentRequestId?: string;
    paymentTransactionId: string;
  }
): Promise<SettleOutcome> {
  let reason = await refundReason(order);

  if (!reason) {
    // Garde `isPaid:false` : un encaissement du staff entre-temps n'est pas écrasé.
    const revived = await prisma.order.updateMany({
      where: { id: order.id, isPaid: false, status: 'CANCELLED' },
      data: { status: 'NEW' },
    });
    // Jèko réessaiera la livraison, qui relira l'état réel.
    if (revived.count === 0) throw new Error('Commande modifiée entre temps');

    try {
      await setOrderPayment(order.id, true, lines, null, { online });
      await awardLoyaltyOnPayment(order.id);
      void announcePaidOrder(order.id).catch((err) => {
        console.error('[jeko] annonce de la commande payée échouée :', err);
      });
      return 'late_validated';
    } catch (err) {
      // Rien n'a été écrit : on remet la commande dans son état d'origine.
      await prisma.order.updateMany({
        where: { id: order.id, isPaid: false, status: 'NEW' },
        data: { status: 'CANCELLED' },
      });
      if (err instanceof StockShortageError) {
        reason = 'stock insuffisant';
      } else {
        if (err instanceof OrderMutationError && err.httpStatus === 409) {
          const fresh = await prisma.order.findUnique({
            where: { id: order.id },
            select: {
              id: true,
              isPaid: true,
              dailyNumber: true,
              paymentTransactionId: true,
            },
          });
          if (fresh?.isPaid) return settledElsewhere(fresh, tx);
        }
        throw err;
      }
    }
  }

  return (await refundLatePayment(order, tx, reason)) === 'refunded'
    ? 'late_refunded'
    : 'late_refund_failed';
}
