// lib/jeko/loyalty-on-paid.ts
//
// Fidélité d'une commande payée en ligne : le tampon est accordé AU PAIEMENT,
// jamais à la création (la commande peut expirer). Si un tampon existe déjà pour
// la commande (expiré puis révoqué, cas d'avant ce changement), il est rétabli
// au lieu d'être recréé. Sans effet pour une commande sans client.
//
// N'échoue jamais (le paiement est déjà enregistré) mais ne perd rien en
// silence : 3 essais espacés, puis, si tout échoue, une alerte push ET une trace
// PERSISTANTE dans le journal du client (ligne d'ajustement à 0 tampon, visible
// sur sa fiche) pour que le staff accorde le tampon à la main.

import prisma from '@/lib/prisma';
import { alertStaff } from './settle-alerts';
import {
  awardLoyaltyForOrder,
  restoreLoyaltyForOrder,
} from '@/lib/loyalty-mutations';

export const LOYALTY_AWARD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

export const LOYALTY_AWARD_FAILED_NOTE =
  'ÉCHEC attribution du tampon (commande payée en ligne) — à ajuster à la main';

type OrderInfo = { customerId: string; total: number; dailyNumber: number };

async function attempt(orderId: string, order: OrderInfo) {
  await prisma.$transaction(async (tx) => {
    const earned = await tx.loyaltyLedger.findFirst({
      where: { orderId, type: 'STAMP_EARNED' },
      select: { id: true },
    });
    const args = {
      customerId: order.customerId,
      orderId,
      orderTotal: order.total,
    };
    if (earned) await restoreLoyaltyForOrder(tx, args);
    else await awardLoyaltyForOrder(tx, { ...args, actorId: null });
  });
}

export async function awardLoyaltyOnPayment(
  orderId: string,
  opts: { retryDelayMs?: number } = {}
): Promise<void> {
  const delay = opts.retryDelayMs ?? RETRY_DELAY_MS;
  let info: OrderInfo | null = null;
  let lastError: unknown;
  for (let i = 1; i <= LOYALTY_AWARD_ATTEMPTS; i++) {
    try {
      if (!info) {
        // staff-visibility: exempt — lecture d'une commande qui vient d'être payée
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { customerId: true, total: true, dailyNumber: true },
        });
        if (!order?.customerId) return;
        info = { ...order, customerId: order.customerId };
      }
      await attempt(orderId, info);
      return;
    } catch (err) {
      lastError = err;
      console.error(
        `[jeko] tampon fidélité : essai ${i}/${LOYALTY_AWARD_ATTEMPTS} échoué :`,
        err
      );
      if (i < LOYALTY_AWARD_ATTEMPTS) await sleep(delay * i);
    }
  }

  console.error('[jeko] tampon fidélité non accordé :', lastError);
  // Trace durable d'abord (ce que le staff retrouvera), alerte push ensuite.
  if (info) {
    try {
      await prisma.loyaltyLedger.create({
        data: {
          customerId: info.customerId,
          type: 'ADJUSTMENT',
          stamps: 0,
          orderId,
          actorId: null,
          note: LOYALTY_AWARD_FAILED_NOTE,
        },
      });
    } catch (err) {
      console.error('[jeko] trace de l’échec fidélité non écrite :', err);
    }
  }
  alertStaff(
    orderId,
    info?.dailyNumber ?? 0,
    'Payée en ligne mais le tampon fidélité n’a pas pu être accordé : à ajuster à la main (fiche client).'
  );
}
