// Mutations de commandes — create-cashier-order.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import {
  getNextDailyNumber,
  todayDailyDate,
  DAILY_NUMBER_MAX_RETRIES,
} from '@/lib/daily-numbering';
import { generateOrderReference } from '@/lib/orders';
import { upsertCustomerForOrder } from '@/lib/customer-mutations';
import {
  awardLoyaltyForOrder,
  consumeLoyaltyReward,
  LoyaltyRewardUnavailableError,
  resolveLoyaltyReward,
} from '@/lib/loyalty-mutations';
import { holdCreditForCashier } from '@/lib/credits/spend';
import { cartRequiresDeposit, computeRequiredDeposit } from '@/lib/deposits';
import { normalizeIvorianPhone } from '@/lib/phone';
import { computeItemsTotal } from '@/lib/orders/totals';
import { isDeferredPickup } from '@/lib/orders/scheduling';
import { parseDateOnlyToUTC } from '@/lib/timezone';
import type { CartItem } from '@/lib/cart-store';
import { notifyOrderCreated } from './notify';
import { OrderMutationError } from './errors';
import { reserveStockOnce } from './stock-reservation';
import type { CreateCashierOrderInput } from './types';

/** Crée une commande walk-in / administrée, avec antidatage optionnel. */
export async function createCashierOrder(input: CreateCashierOrderInput) {
  const rawPhone = input.customerPhone?.trim() || null;
  const normalizedPhone = rawPhone
    ? (normalizeIvorianPhone(rawPhone) ?? rawPhone)
    : null;

  const today = todayDailyDate();
  const dailyDate = input.orderDate
    ? (parseDateOnlyToUTC(input.orderDate) ?? today)
    : today;
  const isBackdated = dailyDate.getTime() !== today.getTime();

  // Un seul `now` : les retries ne doivent pas changer le verdict « différée ».
  const now = new Date();
  const isDeferred = isDeferredPickup(input.pickupTime ?? null, now);

  const grossTotal = computeItemsTotal(input.items as CartItem[]);
  const requiresDeposit = cartRequiresDeposit(input.items as CartItem[]);

  for (let attempt = 0; attempt < DAILY_NUMBER_MAX_RETRIES; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const dailyNumber = await getNextDailyNumber(tx, dailyDate);
        const reference = generateOrderReference(dailyDate);
        const customerId = await upsertCustomerForOrder(
          tx,
          normalizedPhone,
          input.customerName
        );

        const trusted = customerId
          ? ((
              await tx.customer.findUnique({
                where: { id: customerId },
                select: { isTrusted: true },
              })
            )?.isTrusted ?? false)
          : false;
        const autoOnAccount =
          trusted ||
          input.orderType === 'DINE_IN' ||
          input.orderType === 'TAKEAWAY';
        // Seule une commande « en direct » (ni antidatée, ni différée, ni à acompte) part en cuisine.
        const goToKitchen =
          (input.onAccount ?? autoOnAccount) &&
          !isBackdated &&
          !isDeferred &&
          !requiresDeposit;

        let reward: { id: string; capAmount: number } | null = null;
        if (input.loyaltyRewardId) {
          try {
            reward = await resolveLoyaltyReward(
              tx,
              input.loyaltyRewardId,
              customerId
            );
          } catch (err) {
            if (err instanceof LoyaltyRewardUnavailableError) {
              throw new OrderMutationError(err.message, 400);
            }
            throw err;
          }
        }

        const discount = reward ? Math.min(reward.capAmount, grossTotal) : 0;
        const total = grossTotal - discount;

        const created = await tx.order.create({
          data: {
            reference,
            dailyDate,
            dailyNumber,
            customerName: input.customerName ?? null,
            customerPhone: normalizedPhone,
            customerId,
            pickupTime: input.pickupTime ? new Date(input.pickupTime) : null,
            orderType: input.orderType,
            items: input.items,
            total,
            depositRequired: computeRequiredDeposit(
              input.items as CartItem[],
              total
            ),
            note: input.note ?? null,
            createdById: input.createdById ?? null,
            source: input.source ?? 'CASHIER',
            loyaltyRewardId: reward?.id ?? null,
            loyaltyDiscount: discount || null,
            ...(goToKitchen
              ? {
                  status: 'PREPARING' as const,
                  preparingStartedAt: new Date(),
                  isOnAccount: true,
                }
              : {}),
            // Antidatage : createdAt aligné sur le jour ciblé (tri chronologique).
            ...(isBackdated ? { createdAt: dailyDate } : {}),
          },
        });

        if (goToKitchen) {
          // Même transaction : une pénurie annule toute la création.
          await reserveStockOnce(tx, created.id, input.items as CartItem[], {
            coverShortage: input.coverShortage,
            actorId: input.createdById ?? null,
          });
        }

        if (reward) {
          await consumeLoyaltyReward(tx, {
            rewardId: reward.id,
            customerId: customerId as string,
            orderId: created.id,
            capAmount: reward.capAmount,
            actorId: input.createdById ?? null,
          });
        }

        let finalOrder = created;
        if (customerId) {
          const { rewards } = await awardLoyaltyForOrder(tx, {
            customerId,
            orderId: created.id,
            orderTotal: total,
            actorId: input.createdById ?? null,
          });

          if (!reward && rewards.length > 0) {
            const selfReward = rewards[0];
            const selfDiscount = Math.min(selfReward.capAmount, total);
            await consumeLoyaltyReward(tx, {
              rewardId: selfReward.id,
              customerId,
              orderId: created.id,
              capAmount: selfReward.capAmount,
              actorId: input.createdById ?? null,
            });
            finalOrder = await tx.order.update({
              where: { id: created.id },
              data: {
                total: total - selfDiscount,
                loyaltyRewardId: selfReward.id,
                loyaltyDiscount: selfDiscount,
                depositRequired: computeRequiredDeposit(
                  input.items as CartItem[],
                  total - selfDiscount
                ),
              },
            });
          }
        }

        // Avoir du client retenu d'emblée (mention « Avoir » en caisse). Pas pour
        // une commande antidatée (saisie d'historique) ni à acompte (déjà un
        // encaissement partiel) : l'encaissement reste alors manuel.
        if (customerId && !isBackdated && !requiresDeposit) {
          const held = await holdCreditForCashier(tx, {
            orderId: created.id,
            customerId,
            total: finalOrder.total,
          });
          if (held > 0) finalOrder = { ...finalOrder, creditApplied: held };
        }

        return finalOrder;
      });

      if (!isBackdated) notifyOrderCreated(created, now);

      return created;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < DAILY_NUMBER_MAX_RETRIES - 1
      ) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Impossible de générer un numéro de commande quotidien');
}
