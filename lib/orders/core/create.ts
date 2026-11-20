import { type OrderType, Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { getNextDailyNumber, todayDailyDate } from '@/lib/daily-numbering';
import { upsertCustomerForOrder } from '@/lib/customer-mutations';
import {
  awardLoyaltyForOrder,
  consumeLoyaltyReward,
  resolveLoyaltyReward,
} from '@/lib/loyalty-mutations';
import { normalizeIvorianPhone } from '@/lib/phone';
import { ROLE_GROUPS } from '@/lib/auth-helpers';
import { sendPushToRoles } from '@/lib/push-notify';
import { getPickupCode } from '@/lib/orders/format';
import { isDeferredPickup } from '@/lib/orders/scheduling';
import type { CartItem } from '@/lib/cart-store';
import type { AdminMenuCategory } from '@/lib/menu';
import { computeOnlineFee } from '@/lib/online-fee';
import { assertCartMatchesMenu } from '@/lib/orders/cart-verification';
import { reserveStockOnce } from '@/lib/order-mutations';
import { holdCreditForOrder } from '@/lib/credits/spend';
import type { CreateOrderInput } from './schema';
import { generateOrderReference } from './reference';
import { assertPublicOrderConstraints } from './constraints';

export const MAX_DAILY_NUMBER_RETRIES = 3;

/** Paiement en ligne (Jèko). */
export type OnlinePaymentOptions = {
  feePercent: number;
  expiresAt: Date;
  menu: AdminMenuCategory[];
};

export async function createOrder(
  input: CreateOrderInput,
  opts?: { onlinePayment?: OnlinePaymentOptions }
) {
  const dailyDate = todayDailyDate();
  const online = opts?.onlinePayment;

  // Le navigateur n'est cru sur RIEN dès qu'un paiement automatique est en jeu :
  // un total falsifié à 1 F serait encaissé tel quel puis envoyé en cuisine.
  if (online) {
    assertCartMatchesMenu(input.items as CartItem[], online.menu, input.total);
  }

  // Contrôle en lecture seule, non racy — inutile de le refaire à chaque
  // tentative de retry (collision de numéro quotidien) ci-dessous.
  await assertPublicOrderConstraints(
    input.items as CartItem[],
    input.pickupTime ?? null
  );

  for (let attempt = 0; attempt < MAX_DAILY_NUMBER_RETRIES; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const dailyNumber = await getNextDailyNumber(tx, dailyDate);
        const reference = generateOrderReference();
        const customerId = await upsertCustomerForOrder(
          tx,
          input.customerPhone,
          input.customerName
        );

        const driverPhone = input.driverPhone
          ? (normalizeIvorianPhone(input.driverPhone) ?? input.driverPhone)
          : null;

        let reward: { id: string; capAmount: number } | null = null;
        if (input.loyaltyRewardId) {
          reward = await resolveLoyaltyReward(
            tx,
            input.loyaltyRewardId,
            customerId
          );
        }
        const discount = reward ? Math.min(reward.capAmount, input.total) : 0;

        const order = await tx.order.create({
          data: {
            reference,
            dailyDate,
            dailyNumber,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            customerId,
            pickupTime: input.pickupTime ? new Date(input.pickupTime) : null,
            orderType: (input.orderType ?? 'TAKEAWAY') satisfies OrderType,
            items: input.items,
            total: input.total - discount,
            note: input.note ?? null,
            source: 'ONLINE',
            driverName: input.driverName ?? null,
            driverPhone,
            loyaltyRewardId: reward?.id ?? null,
            loyaltyDiscount: discount || null,
          },
        });

        if (reward) {
          await consumeLoyaltyReward(tx, {
            rewardId: reward.id,
            customerId: customerId as string,
            orderId: order.id,
            capAmount: reward.capAmount,
            actorId: null,
          });
        }

        let finalOrder = order;
        // Paiement en ligne : le tampon n'est accordé qu'au paiement validé
        // (`awardLoyaltyOnPayment`), sinon il serait visible sur la carte pour
        // une commande qui peut expirer.
        if (customerId && !online) {
          const { rewards } = await awardLoyaltyForOrder(tx, {
            customerId,
            orderId: order.id,
            orderTotal: order.total,
            actorId: null,
          });

          if (!reward && rewards.length > 0) {
            const selfReward = rewards[0];
            const selfDiscount = Math.min(selfReward.capAmount, order.total);
            await consumeLoyaltyReward(tx, {
              rewardId: selfReward.id,
              customerId,
              orderId: order.id,
              capAmount: selfReward.capAmount,
              actorId: null,
            });
            finalOrder = await tx.order.update({
              where: { id: order.id },
              data: {
                total: order.total - selfDiscount,
                loyaltyRewardId: selfReward.id,
                loyaltyDiscount: selfDiscount,
              },
            });
          }
        }

        if (online && finalOrder.total > 0) {
          // Avoir du client : retenu dès maintenant, car il réduit ce que Jèko
          // encaissera (et donc les frais, calculés sur la part payée en ligne).
          const credit =
            input.useCredit && customerId
              ? await holdCreditForOrder(tx, {
                  orderId: finalOrder.id,
                  customerId,
                  total: finalOrder.total,
                })
              : 0;
          finalOrder = await tx.order.update({
            where: { id: finalOrder.id },
            data: {
              onlineFee: computeOnlineFee(
                finalOrder.total - credit,
                online.feePercent
              ),
              paymentExpiresAt: online.expiresAt,
            },
          });

          if (!isDeferredPickup(finalOrder.pickupTime)) {
            await reserveStockOnce(
              tx,
              finalOrder.id,
              input.items as CartItem[]
            );
          }
        }

        return finalOrder;
      });

      if (created.paymentExpiresAt != null) return created;
      sendPushToRoles(ROLE_GROUPS.DASHBOARD, {
        title: 'Nouvelle commande en ligne',
        body:
          `#${String(created.dailyNumber).padStart(3, '0')} · ${getPickupCode(created.reference)}` +
          ` · ${created.total} FCFA` +
          `${created.customerName ? ` · ${created.customerName}` : ''}` +
          `${created.orderType === 'DELIVERY' ? ' · livreur client' : ''}`,
        url: '/dashboard/caisse',
        tag: `order-${created.id}`,
      }).catch((err) => {
        console.error('[orders] notification push échouée :', err);
      });

      return created;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < MAX_DAILY_NUMBER_RETRIES - 1
      ) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Impossible de générer un numéro de commande quotidien');
}
