// Mutations de commandes — pay-and-complete.

import type { UserRole } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { canTogglePayment } from '@/lib/order-permissions';
import { formatPickup, isDeferredPickup } from '@/lib/orders/scheduling';
import type { OrderPaymentLineInput } from '@/lib/schemas/order';
import type { CartItem } from '@/lib/cart-store';
import { notifyOrderCustomer } from '@/lib/push-notify';
import { OrderMutationError, StockShortageError } from './errors';
import {
  reserveStockOnce,
  notifyPendingOrdersOfShortage,
} from './stock-reservation';
import { resolvePaymentMode } from './payment-mode';
import { applyPaymentCredit } from './credit';

export async function payAndComplete(
  id: string,
  payments: OrderPaymentLineInput[] | undefined,
  role: UserRole,
  actorId?: string | null,
  opts?: { coverShortage?: boolean }
): Promise<{ alreadyPaid: boolean }> {
  if (!canTogglePayment(role)) {
    throw new OrderMutationError('Action réservée à la caisse', 403);
  }

  const now = new Date();
  let txResult: { alreadyPaid: boolean; reserved: boolean; items: CartItem[] };
  try {
    txResult = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          status: true,
          isPaid: true,
          items: true,
          total: true,
          pickupTime: true,
          stockReservedAt: true,
          depositPaid: true,
          depositRequired: true,
          customerId: true,
          creditApplied: true,
        },
      });
      if (!order) {
        throw new OrderMutationError('Commande introuvable', 404);
      }
      if (order.status === 'CANCELLED') {
        throw new OrderMutationError('Commande annulée', 409);
      }
      if (order.status === 'COMPLETED' && order.isPaid) {
        throw new OrderMutationError('Commande déjà finalisée', 409);
      }
      if (
        order.stockReservedAt === null &&
        isDeferredPickup(order.pickupTime, now)
      ) {
        throw new OrderMutationError(
          `Retrait prévu ${formatPickup(order.pickupTime as Date, now)} : encaissez la commande, elle sera remise le jour du retrait. ` +
            'Pour la remettre maintenant, modifiez d’abord le créneau de retrait.',
          409
        );
      }

      const alreadyPaid = order.isPaid;
      const items = order.items as unknown as CartItem[];

      if (!alreadyPaid) {
        if (!payments || payments.length === 0) {
          throw new OrderMutationError(
            'payments requis pour encaisser cette commande',
            400
          );
        }
        const expected = order.total - (order.depositPaid ?? 0);
        const sum = payments.reduce((s, p) => s + p.amount, 0);
        if (sum !== expected) {
          throw new OrderMutationError(
            `Le total des paiements (${sum} F) ne correspond pas au solde de la commande (${expected} F)`,
            400
          );
        }
      }

      const reserved = await reserveStockOnce(tx, id, items, {
        coverShortage: opts?.coverShortage,
        actorId,
      });

      const result = await tx.order.updateMany({
        where: { id, status: order.status, isPaid: order.isPaid },
        data: {
          status: 'COMPLETED',
          // Ne pas écraser le mode / l'horodatage d'une commande déjà payée.
          ...(alreadyPaid
            ? {}
            : {
                isPaid: true,
                paymentMode: resolvePaymentMode(
                  payments as OrderPaymentLineInput[]
                ),
                paidAt: new Date(),
                ...(order.depositRequired != null
                  ? { depositPaid: order.total, depositPaidAt: new Date() }
                  : {}),
              }),
        },
      });

      if (result.count === 0) {
        throw new OrderMutationError(
          'État modifié entre temps, recharger',
          409
        );
      }

      if (!alreadyPaid) {
        await applyPaymentCredit(
          tx,
          { id, ...order },
          payments as OrderPaymentLineInput[],
          actorId
        );
        await tx.orderPayment.createMany({
          data: (payments as OrderPaymentLineInput[]).map((p) => ({
            orderId: id,
            mode: p.mode,
            amount: p.amount,
            createdById: actorId ?? null,
          })),
        });
      }

      return { alreadyPaid, reserved, items };
    });
  } catch (err) {
    if (err instanceof StockShortageError) {
      notifyOrderCustomer(id, 'ITEM_UNAVAILABLE');
    }
    throw err;
  }

  // Après la transaction seulement (jamais dedans) : commande soldée et
  // récupérée en un geste → dernière notification client, puis désabonnement.
  notifyOrderCustomer(id, 'COMPLETED');

  if (txResult.reserved) {
    notifyPendingOrdersOfShortage(id, txResult.items).catch((err) => {
      console.error('[order-mutations] fan-out stock épuisé échoué :', err);
    });
  }

  return { alreadyPaid: txResult.alreadyPaid };
}
