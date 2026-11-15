// lib/jeko/loyalty-on-paid.ts
//
// Fidélité d'une commande payée en ligne : le tampon est accordé AU PAIEMENT,
// jamais à la création (la commande peut expirer). Si un tampon existe déjà pour
// la commande (expiré puis révoqué, cas d'avant ce changement), il est rétabli
// au lieu d'être recréé. Sans effet pour une commande sans client. N'échoue
// jamais : le paiement est déjà enregistré ; un échec alerte le staff (ajustement manuel).

import prisma from '@/lib/prisma';
import { alertStaff } from './settle-alerts';
import {
  awardLoyaltyForOrder,
  restoreLoyaltyForOrder,
} from '@/lib/loyalty-mutations';

export async function awardLoyaltyOnPayment(orderId: string): Promise<void> {
  let dailyNumber = 0;
  try {
    // staff-visibility: exempt — lecture d'une commande qui vient d'être payée
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, total: true, dailyNumber: true },
    });
    if (!order?.customerId) return;
    dailyNumber = order.dailyNumber;
    const customerId = order.customerId;
    await prisma.$transaction(async (tx) => {
      const earned = await tx.loyaltyLedger.findFirst({
        where: { orderId, type: 'STAMP_EARNED' },
        select: { id: true },
      });
      const args = { customerId, orderId, orderTotal: order.total };
      if (earned) await restoreLoyaltyForOrder(tx, args);
      else await awardLoyaltyForOrder(tx, { ...args, actorId: null });
    });
  } catch (err) {
    console.error('[jeko] tampon fidélité non accordé :', err);
    // Le webhook répond 200 : sans alerte, le tampon serait perdu en silence.
    alertStaff(
      orderId,
      dailyNumber,
      'Payée en ligne mais le tampon fidélité n’a pas pu être accordé : à ajuster à la main (fiche client).'
    );
  }
}
