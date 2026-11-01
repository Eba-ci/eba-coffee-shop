// lib/jeko/expiry.ts
//
// Expiration OPPORTUNISTE des commandes en attente de paiement Jèko. Pas de cron :
// le rappel d'inventaire part déjà au chargement du dashboard
// (`app/(dashboard)/dashboard/page.tsx`), on fait pareil — l'appelant lance
// `void expirePendingOrders().catch(() => {})` sans bloquer son rendu.
//
// Le webhook Jèko ne signale QUE les succès : un abandon ou un échec ne déclenche
// rien. C'est donc ici qu'on le constate, après avoir interrogé Jèko :
//   - paiement réussi  → on règle (jamais d'annulation d'une commande payée) ;
//   - Jèko injoignable → on n'expire PAS, on réessaiera au prochain passage ;
//   - sinon            → annulation SYSTÈME, qui défait la fidélité.
//
// L'annulation n'emprunte pas `setOrderStatus` : il exige un rôle de staff, garde
// la récompense sur la commande (`keepUsedReward`) et notifie « annulée par le
// staff ». Ici le client récupère sa récompense et la page de suivi montre
// simplement « expirée ».

import prisma from '@/lib/prisma';
import { revokeLoyaltyForOrder } from '@/lib/loyalty-mutations';
import { releaseUnpaidStockHold } from '@/lib/order-mutations';
import { restoreOrderCredit } from '@/lib/credits/spend';
import { revalidatePublicMenu } from '@/lib/revalidate-public-menu';
import type { CartItem } from '@/lib/cart-store';
import { JekoApiError, getJekoPaymentRequest } from './client';
import { parseJekoAccount } from './accounts';
import { jekoConfig } from './config';
import { settleFromRemote } from './reconcile';

// Marge après `paymentExpiresAt` : laisse le temps au webhook d'une tentative
// juste à l'échéance.
const GRACE_MS = 2 * 60_000;
// Un passage par minute et par processus. Le balayage est idempotent (`updateMany`
// gardé sur le statut) : deux processus qui se chevauchent feraient au pire deux
// passages rapprochés.
const THROTTLE_MS = 60_000;
const BATCH_SIZE = 20;

// Une commande reportée (Jèko injoignable, config absente) ne doit pas occuper le
// lot à chaque passage et affamer les suivantes : on la laisse de côté un moment.
const DEFER_MS = 10 * 60_000;

let lastRunAt = 0;
const deferredUntil = new Map<string, number>();

type Overdue = {
  id: string;
  customerId: string | null;
  loyaltyRewardId: string | null;
  paymentRequestId: string | null;
  items: unknown;
  stockReservedAt: Date | null;
};

export type ExpiryResult = {
  expired: number;
  settled: number;
  skipped: number;
};

async function expireOrder(order: Overdue): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Gardé sur `isPaid:false` et `NEW` : une commande payée ou déjà prise en
    // charge entre-temps n'est pas touchée, sa fidélité non plus.
    const updated = await tx.order.updateMany({
      // `paymentExpiresAt` non nul : « Prendre en caisse » (releasePendingOrder) le
      // remet à nul, la commande est alors celle du staff, plus à expirer.
      where: {
        id: order.id,
        isPaid: false,
        status: 'NEW',
        paymentExpiresAt: { not: null },
      },
      data: { status: 'CANCELLED' },
    });
    if (updated.count === 0) return false;

    // Commande du jour dont `createOrder` (lib/orders.ts) avait réservé le
    // stock dès la création, le temps de cette fenêtre de paiement : le
    // paiement n'arrive jamais, rien n'a été préparé, on rend le stock (voir
    // `releaseUnpaidStockHold`, lib/order-mutations.ts, pour pourquoi ce cas
    // peut redescendre `stockReservedAt` à `null` sans contredire son
    // irréversibilité habituelle).
    if (order.stockReservedAt) {
      await releaseUnpaidStockHold(tx, order.items as unknown as CartItem[]);
      await tx.order.update({
        where: { id: order.id },
        data: { stockReservedAt: null },
      });
    }

    if (order.customerId) {
      await revokeLoyaltyForOrder(tx, {
        orderId: order.id,
        customerId: order.customerId,
        usedRewardId: order.loyaltyRewardId,
        note: 'Paiement en ligne expiré',
      });
    }
    // L'avoir retenu pour ce paiement jamais arrivé retourne au client.
    await restoreOrderCredit(tx, order.id);
    return true;
  });
}

export async function expirePendingOrders(
  now: Date = new Date()
): Promise<ExpiryResult> {
  const result: ExpiryResult = { expired: 0, settled: 0, skipped: 0 };
  if (now.getTime() - lastRunAt < THROTTLE_MS) return result;
  lastRunAt = now.getTime();

  for (const [id, until] of deferredUntil) {
    if (until <= now.getTime()) deferredUntil.delete(id);
  }

  // staff-visibility: exempt — c'est précisément ce module qui traite les commandes en attente de paiement
  const overdue = await prisma.order.findMany({
    where: {
      id: { notIn: [...deferredUntil.keys()] },
      source: 'ONLINE',
      isPaid: false,
      status: 'NEW',
      // `onlineFee` non nul = commande créée pour un paiement en ligne.
      onlineFee: { not: null },
      paymentExpiresAt: { lt: new Date(now.getTime() - GRACE_MS) },
    },
    select: {
      id: true,
      customerId: true,
      loyaltyRewardId: true,
      paymentRequestId: true,
      jekoAccount: true,
      items: true,
      stockReservedAt: true,
    },
    orderBy: { paymentExpiresAt: 'asc' },
    take: BATCH_SIZE,
  });

  for (const order of overdue) {
    try {
      // Les clés du compte qui porte la demande, pas celles du compte actif :
      // un 404 d'un autre compte ferait annuler une commande peut-être payée.
      const account = parseJekoAccount(order.jekoAccount);
      const config = jekoConfig(account);
      // Sans configuration (variables retirées ou en rotation), on ne peut pas
      // interroger Jèko : expirer une commande qui a une demande de paiement
      // pourrait annuler une commande déjà payée. On attend le retour de la config.
      if (!config && order.paymentRequestId) {
        deferredUntil.set(order.id, now.getTime() + DEFER_MS);
        result.skipped++;
        continue;
      }
      if (config && order.paymentRequestId) {
        // 404 : Jèko ne connaît pas la demande, il n'y a rien à encaisser. Sans
        // ce cas la commande resterait « reportée » à chaque passage, à jamais.
        const remote = await getJekoPaymentRequest(
          config,
          order.paymentRequestId
        ).catch((err) => {
          if (err instanceof JekoApiError && err.status === 404) return null;
          throw err;
        });
        if (remote?.status === 'success') {
          if ((await settleFromRemote(remote, account)) === 'unreadable') {
            // Succès sans détail de transaction : on ne peut ni régler ni
            // expirer sans risque, on laisse la main au prochain passage.
            deferredUntil.set(order.id, now.getTime() + DEFER_MS);
            result.skipped++;
          } else {
            result.settled++;
          }
          continue;
        }
      }
      if (await expireOrder(order)) result.expired++;
    } catch (err) {
      console.error(`[jeko] expiration de ${order.id} reportée :`, err);
      deferredUntil.set(order.id, now.getTime() + DEFER_MS);
      result.skipped++;
    }
  }

  // Le stock retenu pour ces commandes vient d'être restitué.
  if (result.expired > 0) revalidatePublicMenu();

  return result;
}
