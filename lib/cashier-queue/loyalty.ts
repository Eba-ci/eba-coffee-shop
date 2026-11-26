import prisma from '@/lib/prisma';
import { getLoyaltySettings } from '@/lib/loyalty-settings-db';

/** Fidélité de toute la file en requêtes batchées (pas de N+1 par commande). */
export async function loadQueueLoyalty(
  orders: { id: string; status: string; customerId: string | null }[]
) {
  const customerIds = [
    ...new Set(
      orders.map((o) => o.customerId).filter((id): id is string => id !== null)
    ),
  ];
  // Issue du tampon : seulement pour les commandes READY (bouton « c'est prêt »).
  const readyOrderIds = orders
    .filter((o) => o.status === 'READY' && o.customerId !== null)
    .map((o) => o.id);

  const [loyaltySettings, customers, stampLedgerForReadyOrders] =
    await Promise.all([
      getLoyaltySettings(),
      customerIds.length > 0
        ? prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, stampCount: true, loyaltyDisabled: true },
          })
        : Promise.resolve([]),
      readyOrderIds.length > 0
        ? prisma.loyaltyLedger.findMany({
            where: { type: 'STAMP_EARNED', orderId: { in: readyOrderIds } },
            select: { orderId: true, customerId: true },
          })
        : Promise.resolve([]),
    ]);

  const stampCountByCustomerId = new Map(
    customers.map((c) => [c.id, c.stampCount])
  );
  // Fidélité désactivée pour ce client : pas de message « tampon » à la remise.
  const loyaltyDisabledCustomerIds = new Set(
    customers.filter((c) => c.loyaltyDisabled).map((c) => c.id)
  );
  const stampEarnedOrderIds = new Set(
    stampLedgerForReadyOrders.map((l) => l.orderId)
  );
  // « Premier tampon jamais gagné » : une seule entrée STAMP_EARNED au ledger, tous temps confondus.
  const readyCustomerIds = [
    ...new Set(stampLedgerForReadyOrders.map((l) => l.customerId)),
  ];
  const stampCountsByCustomer =
    readyCustomerIds.length > 0
      ? await prisma.loyaltyLedger.groupBy({
          by: ['customerId'],
          where: { type: 'STAMP_EARNED', customerId: { in: readyCustomerIds } },
          _count: { _all: true },
        })
      : [];
  const totalStampEntriesByCustomerId = new Map(
    stampCountsByCustomer.map((g) => [g.customerId, g._count._all])
  );

  return {
    loyaltySettings,
    stampCountByCustomerId,
    loyaltyDisabledCustomerIds,
    stampEarnedOrderIds,
    totalStampEntriesByCustomerId,
  };
}
