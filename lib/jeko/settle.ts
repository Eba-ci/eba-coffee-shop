// lib/jeko/settle.ts
//
// Règlement d'une transaction Jèko réussie (reçue par webhook, ou lue par
// `GET /payment_requests/{id}` lors d'une réconciliation). L'argent a déjà bougé
// chez Jèko : chaque cas limite aboutit à un état que le staff VOIT (push +
// commande), jamais à un paiement perdu en silence.
//
// On encaisse `order.total` (le prix des produits) : les frais en ligne sont
// payés EN PLUS à Jèko, ils ne sont jamais du CA (cf. `Order.onlineFee`).

import prisma from '@/lib/prisma';
import {
  OrderMutationError,
  StockShortageError,
  setOrderPayment,
} from '@/lib/order-mutations';
import { awardLoyaltyOnPayment } from './loyalty-on-paid';
import { announcePaidOrder } from './notify-paid';
import { jekoMethodToPaymentMode } from './payment-mode';
import { parseJekoReference } from './reference';
import type { JekoAccount } from './accounts';
import { alertStaff, settledElsewhere } from './settle-alerts';
import { isExpiredCancellation, settleLatePayment } from './settle-late';
import type { JekoTransaction } from './webhook-payload';

export type SettleOutcome =
  | 'paid'
  | 'already_paid'
  | 'duplicate_payment'
  | 'late_payment'
  | 'late_validated'
  | 'late_refunded'
  | 'late_refund_failed'
  | 'amount_mismatch'
  | 'shortage'
  | 'ignored';

const ORDER_SELECT = {
  id: true,
  isPaid: true,
  status: true,
  total: true,
  onlineFee: true,
  dailyNumber: true,
  paymentAmountDue: true,
  paymentCreditPart: true,
  paymentTransactionId: true,
  jekoAccount: true,
  paymentExpiresAt: true,
  reference: true,
  customerName: true,
  customerPhone: true,
  loyaltyRewardId: true,
  pickupTime: true,
} as const;

export async function settleJekoTransaction(
  tx: JekoTransaction,
  account?: JekoAccount
): Promise<SettleOutcome> {
  // Le webhook ne signale que les succès ; tout autre statut n'est pas à régler.
  if (tx.status !== 'success') return 'ignored';

  const parsed = parseJekoReference(tx.reference);
  if (!parsed) return 'ignored';

  const order = await prisma.order.findUnique({
    where: { reference: parsed.orderReference },
    select: ORDER_SELECT,
  });
  // `onlineFee` nul = commande née hors paiement en ligne : pas la nôtre.
  if (!order || order.onlineFee === null) return 'ignored';

  const fees = {
    gatewayFee: Math.round(tx.gatewayFeeFcfa),
    paymentRequestId: tx.paymentRequestId ?? undefined,
    paymentTransactionId: tx.transactionId,
  };

  if (order.isPaid) return settledElsewhere(order, tx);

  // Déjà réglée par CETTE transaction puis dépayée (remboursement) : le dépaiement
  // conserve `paymentTransactionId`. Une livraison rejouée ou un rechargement de
  // `?paiement=ok` ne doit pas la remettre « payée ».
  if (order.paymentTransactionId === tx.transactionId) return 'ignored';

  // L'argent est arrivé sur CE compte (webhook signé par lui, ou relecture avec ses
  // clés) : une relance faite depuis sur l'autre compte ne doit pas détourner les
  // remboursements et relectures ultérieurs.
  if (account && order.jekoAccount !== account) {
    await prisma.order.update({
      where: { id: order.id },
      data: { jekoAccount: account },
    });
    order.jekoAccount = account;
  }

  // Montant FIGÉ à la tentative : `total` peut avoir changé depuis (l'annulation
  // par le client le remet au prix brut) alors que la demande déjà envoyée à Jèko,
  // elle, ne change pas.
  const due =
    order.paymentAmountDue ??
    order.total - order.paymentCreditPart + order.onlineFee;
  if (tx.amountFcfa !== due) {
    console.error(
      `[jeko] montant reçu ${tx.amountFcfa} F ≠ dû ${due} F (commande ${parsed.orderReference})`
    );
    // On sort la commande de l'attente : sinon l'expiration la reprendrait à
    // chaque passage (relecture Jèko, nouvelle alerte), sans jamais l'annuler.
    // Elle devient une commande normale que le staff voit et tranche.
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, isPaid: false, paymentExpiresAt: { not: null } },
      data: { paymentExpiresAt: null },
    });
    // Alerte une seule fois : un rejeu (sondage de vérification) trouve
    // `paymentExpiresAt` déjà nul et ne réalerte pas le staff.
    if (count > 0) {
      alertStaff(
        order.id,
        order.dailyNumber,
        `Montant reçu ${tx.amountFcfa} F au lieu de ${due} F : commande non encaissée, à vérifier.`
      );
    }
    return 'amount_mismatch';
  }

  // Part payée par avoir (retenue à la création) : `due` = total − avoir + frais.
  const creditUsed = order.paymentCreditPart;
  const lines = [
    {
      mode: jekoMethodToPaymentMode(tx.paymentMethod),
      amount: order.total - creditUsed,
    },
    ...(creditUsed > 0 ? [{ mode: 'AVOIR' as const, amount: creditUsed }] : []),
  ];
  // Identifiant de transaction et frais partent AVEC `isPaid` (une seule
  // écriture) : une commande payée sans `paymentTransactionId` l'a été hors Jèko.
  const online = {
    gatewayFee: fees.gatewayFee,
    paymentRequestId: fees.paymentRequestId,
    paymentTransactionId: fees.paymentTransactionId,
  };
  // Délai dépassé (commande expirée) : valider si le stock suit, sinon rembourser.
  if (isExpiredCancellation(order)) {
    return settleLatePayment(order, tx, lines, online);
  }

  let shortage = false;
  const late = order.status === 'CANCELLED';
  for (;;) {
    try {
      try {
        await setOrderPayment(order.id, true, lines, null, { online });
      } catch (err) {
        if (!(err instanceof StockShortageError)) throw err;
        // Rupture entre la création et le paiement : le client a payé, la commande
        // ne peut pas partir en cuisine. L'argent est bien là : on l'enregistre
        // (sans cuisine) pour que la commande, le solde Jèko et la clôture restent
        // justes. Le staff la lance ensuite par le flux habituel, en confirmant la
        // production (`coverShortage`).
        shortage = true;
        await setOrderPayment(order.id, true, lines, null, {
          online,
          skipKitchen: true,
        });
      }
      break;
    } catch (err) {
      if (!(err instanceof OrderMutationError && err.httpStatus === 409)) {
        // Toute autre erreur remonte : le webhook répond 500 et Jèko réessaie.
        throw err;
      }
      const fresh = await prisma.order.findUnique({
        where: { reference: parsed.orderReference },
        select: ORDER_SELECT,
      });
      // Deux livraisons simultanées, ou un encaissement du staff entre-temps.
      if (fresh?.isPaid) return settledElsewhere(fresh, tx);
      // L'expiration a annulé la commande entre notre lecture et l'écriture :
      // même traitement qu'un paiement tardif (valider ou rembourser).
      if (fresh && isExpiredCancellation(fresh)) {
        return settleLatePayment(fresh, tx, lines, online);
      }
      throw err;
    }
  }

  // Le paiement est enregistré. Commande annulée par une personne (staff ou
  // client) avant l'arrivée du paiement : encaissé, mais pas remis en cuisine. Le
  // staff la reprend par le flux existant (qui restitue le tampon) ou la rembourse
  // — on ne reconsomme pas une récompense à l'aveugle.
  // Tampon accordé au paiement validé (pas pour une annulée par une personne :
  // la reprise par le staff le restitue).
  if (!late) await awardLoyaltyOnPayment(order.id);
  if (shortage) {
    alertStaff(
      order.id,
      order.dailyNumber,
      `Payée en ligne (${tx.amountFcfa} F) mais stock insuffisant : à lancer en cuisine après avoir confirmé la production. Ne pas la refaire payer.`
    );
  } else if (late) {
    alertStaff(
      order.id,
      order.dailyNumber,
      `Payée en ligne (${tx.amountFcfa} F) après annulation : rétablir ou rembourser.`
    );
  } else {
    // Commande normale, désormais payée : c'est maintenant que le staff l'apprend
    // (elle était invisible tant qu'elle attendait). Sans attendre : la réponse au
    // webhook ne dépend ni du push ni du courriel.
    void announcePaidOrder(order.id).catch((err) => {
      console.error('[jeko] annonce de la commande payée échouée :', err);
    });
  }

  if (shortage) return 'shortage';
  return late ? 'late_payment' : 'paid';
}
