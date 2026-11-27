// lib/customer-privacy.ts
//
// Droits des personnes sur la fiche client (loi ivoirienne 2013-450 : accès,
// rectification, suppression). Deux gestes :
//   - `exportCustomerData` : tout ce que nous savons d'un client, en JSON.
//   - `anonymizeCustomer`  : effacement. On ne supprime pas la ligne `Order`
//     (comptabilité : montant, date, articles) mais on en retire nom,
//     téléphone et note, ainsi que tout ce qui rattache la personne (fidélité,
//     votes, suggestions, notifications push, conversations WhatsApp). Le
//     téléphone de la fiche est
//     remplacé par `anon-<id>` pour respecter l'unicité de la colonne.

import prisma from '@/lib/prisma';
import { withStaffVisible } from '@/lib/orders/visibility';

export class CustomerHasDebtError extends Error {
  constructor() {
    super(
      'Ce client a des commandes impayées (ardoise) : réglez-les ou annulez-les avant de l’anonymiser.'
    );
  }
}

export class CustomerHasCreditError extends Error {
  constructor() {
    super(
      'Ce client a un avoir : faites-le utiliser ou convertissez-le en argent avant de l’anonymiser.'
    );
  }
}

export const anonymousPhoneMarker = (id: string) => `anon-${id}`;

export function isAnonymizedPhone(phone: string): boolean {
  return phone.startsWith('anon-');
}

export async function exportCustomerData(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: {
        select: {
          reference: true,
          createdAt: true,
          status: true,
          total: true,
          isPaid: true,
          customerName: true,
          customerPhone: true,
          note: true,
          pickupTime: true,
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      rewards: true,
      ledger: true,
      // Avoirs : solde (champ `creditBalance`) et mouvements.
      creditEntries: {
        select: {
          kind: true,
          delta: true,
          balanceAfter: true,
          note: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      // Remboursements : montants, motif, statut et date (pas le détail du journal).
      refunds: {
        select: {
          amount: true,
          reason: true,
          status: true,
          channel: true,
          destinationPhone: true,
          payoutDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      pollVotes: {
        select: { pollId: true, optionId: true, createdAt: true },
      },
      // Conversations WhatsApp rattachées à la fiche : numéro et messages échangés.
      whatsappConversations: {
        select: {
          waId: true,
          createdAt: true,
          messages: {
            select: { direction: true, type: true, body: true, sentAt: true },
            orderBy: { sentAt: 'asc' },
          },
        },
      },
    },
  });
  if (!customer) throw new Error('Client introuvable.');
  const suggestions = await prisma.pollSuggestion.findMany({
    where: { submitterPhone: customer.phone },
    select: { label: true, description: true, status: true, createdAt: true },
  });
  return { exportedAt: new Date().toISOString(), customer, suggestions };
}

/** Anonymise un client. `now` injectable pour les tests. */
export async function anonymizeCustomer(id: string, now = new Date()) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, phone: true, anonymizedAt: true, creditBalance: true },
  });
  if (!customer) throw new Error('Client introuvable.');
  if (customer.anonymizedAt) return { alreadyAnonymized: true as const };

  // withStaffVisible : une commande en ligne en attente de paiement (jamais
  // honorée) n'est pas une dette.
  const debt = await prisma.order.count({
    where: withStaffVisible({
      OR: [{ customerId: id }, { customerPhone: customer.phone }],
      isPaid: false,
      status: { not: 'CANCELLED' },
    }),
  });
  if (debt > 0) throw new CustomerHasDebtError();
  // Effacer le client ferait perdre son avoir : ce serait une dette qu'on annule en silence.
  if (customer.creditBalance > 0) throw new CustomerHasCreditError();

  const orderOwner = {
    OR: [{ customerId: id }, { customerPhone: customer.phone }],
  };

  await prisma.$transaction([
    prisma.pushSubscription.deleteMany({ where: { order: orderOwner } }),
    prisma.order.updateMany({
      where: orderOwner,
      data: { customerName: null, customerPhone: null, note: null },
    }),
    // Remboursements : montants, motif et dates restent (comptabilité), l'identité part.
    prisma.refund.updateMany({
      where: {
        OR: [
          { customerId: id },
          { destinationPhone: customer.phone },
          { order: orderOwner },
        ],
      },
      data: { customerName: null, destinationPhone: null },
    }),
    prisma.pollVote.updateMany({
      where: { OR: [{ customerId: id }, { voterPhone: customer.phone }] },
      data: {
        voterPhone: null,
        voterToken: null,
        ipAddress: null,
        userAgent: null,
        customerId: null,
      },
    }),
    prisma.pollSuggestion.updateMany({
      where: { submitterPhone: customer.phone },
      data: { submitterPhone: null, submitterName: null },
    }),
    prisma.loyaltyReward.deleteMany({ where: { customerId: id } }),
    prisma.loyaltyLedger.deleteMany({ where: { customerId: id } }),
    // Conversations WhatsApp rattachées : le numéro et les messages partent avec.
    prisma.whatsAppConversation.deleteMany({ where: { customerId: id } }),
    prisma.customer.update({
      where: { id },
      data: {
        phone: anonymousPhoneMarker(id),
        name: null,
        dateOfBirth: null,
        stampCount: 0,
        lastStampDate: null,
        loyaltyDisabled: false,
        isTrusted: false,
        trustedSince: null,
        trustedNote: null,
        anonymizedAt: now,
      },
    }),
  ]);
  return { alreadyAnonymized: false as const };
}
