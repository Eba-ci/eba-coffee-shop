import { withStaffVisible } from '@/lib/orders/visibility';
import type { OrderStatus, OrderType } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { getLoyaltyCard, getLoyaltyCardByPhone } from '@/lib/loyalty';
import {
  fetchStockSnapshot,
  computeOrderItemsAvailability,
} from '@/lib/orders/availability';
import { isDeferredPickup } from '@/lib/orders/scheduling';
import { isHoldCandidate, summarizeStockHolds } from '@/lib/orders/stock-holds';
import { getPaymentView, type PaymentView } from '@/lib/orders/payment-view';
import type { CartItem } from '@/lib/cart-store';

export async function getOrder(id: string) {
  // `payments` : détail des lignes de paiement fractionné (affiché quand
  // `paymentMode` est null malgré `isPaid=true` — cf. page de détail admin).
  return prisma.order.findUnique({
    where: { id },
    include: { payments: true },
  });
}

/** Article de commande enrichi de sa disponibilité courante (voir plus bas). */
export type PublicOrderItemView = CartItem & {
  available: boolean;
  missingProduct?: boolean;
  missingOptionNames?: string[];
};

/** Avancement de la carte fidélité du client, pour la page de suivi. */
export type PublicOrderLoyaltyView = {
  stampCount: number;
  stampsPerCard: number;
  tier1Stamps: number;
  tier1RewardCap: number;
  tier2RewardCap: number;
  minOrderAmount: number;
  availableRewardsCount: number;
  /** Vrai si c'est la seule commande (à ce jour) rattachée à ce client. */
  isFirstOrder: boolean;
};

export type PublicOrderView = {
  id: string;
  reference: string;
  dailyNumber: number;
  status: OrderStatus;
  orderType: OrderType;
  isPaid: boolean;
  payment: PaymentView;
  customerName: string | null;
  pickupTime: string | null;
  items: PublicOrderItemView[];
  fulfillable: boolean;
  loyaltyDiscount: number | null;
  total: number;
  depositRequired: number | null;
  depositPaid: number | null;
  note: string | null;
  driverName: string | null;
  driverPhone: string | null;
  createdAt: string;
  loyalty: PublicOrderLoyaltyView | null;
  /** Remboursements : déjà rendu / en cours de traitement (FCFA). */
  refunds: { paid: number; pending: number };
};

export async function getPublicOrder(
  id: string
): Promise<PublicOrderView | null> {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return null;

  const items = order.items as unknown as CartItem[];

  let itemsView: PublicOrderItemView[];
  let fulfillable: boolean;
  if (order.stockReservedAt || isDeferredPickup(order.pickupTime)) {
    itemsView = items.map((item) => ({ ...item, available: true }));
    fulfillable = true;
  } else {
    // Programmée payée du jour : le stock déjà réservé pour elle compte comme disponible.
    const hold = isHoldCandidate(order, new Date())
      ? (await summarizeStockHolds([{ id: order.id, items }])).get(order.id)
      : undefined;
    const availability =
      hold?.availability ??
      computeOrderItemsAvailability(items, await fetchStockSnapshot([items]));
    const byCartId = new Map(availability.items.map((a) => [a.cartId, a]));
    itemsView = items.map((item) => {
      const a = byCartId.get(item.cartId);
      return a && !a.available
        ? {
            ...item,
            available: false,
            missingProduct: a.missingProduct,
            missingOptionNames: a.missingOptionNames,
          }
        : { ...item, available: true };
    });
    fulfillable = availability.fulfillable;
  }

  const [loyalty, refunds] = await Promise.all([
    getPublicOrderLoyalty(order),
    getPublicOrderRefunds(order.id),
  ]);
  const payment = getPaymentView(order);

  return {
    id: order.id,
    reference: order.reference,
    dailyNumber: order.dailyNumber,
    status: order.status,
    orderType: order.orderType,
    isPaid: order.isPaid,
    payment,
    customerName: order.customerName,
    pickupTime: order.pickupTime?.toISOString() ?? null,
    items: itemsView,
    fulfillable,
    loyaltyDiscount: order.loyaltyDiscount,
    total: order.total,
    depositRequired: order.depositRequired,
    depositPaid: order.depositPaid,
    note: order.note,
    driverName: order.driverName,
    driverPhone: order.driverPhone,
    createdAt: order.createdAt.toISOString(),
    loyalty,
    refunds,
  };
}

/** Montants remboursés / en cours pour la page de suivi (jamais le détail interne). */
async function getPublicOrderRefunds(
  orderId: string
): Promise<{ paid: number; pending: number }> {
  const grouped = await prisma.refund.groupBy({
    by: ['status'],
    where: {
      orderId,
      creditSourceId: null,
      status: {
        in: ['PAID', 'APPROVED', 'PROCESSING', 'UNCERTAIN', 'FAILED'],
      },
    },
    _sum: { amount: true },
  });
  let paid = 0;
  let pending = 0;
  for (const g of grouped) {
    if (g.status === 'PAID') paid += g._sum.amount ?? 0;
    else pending += g._sum.amount ?? 0;
  }
  return { paid, pending };
}

export async function getPublicOrderLoyalty(order: {
  customerId: string | null;
  customerPhone: string | null;
}): Promise<PublicOrderLoyaltyView | null> {
  const card = order.customerId
    ? await getLoyaltyCard(order.customerId)
    : order.customerPhone
      ? await getLoyaltyCardByPhone(order.customerPhone)
      : null;
  // Gelée (programme ou client désactivé) : pas de carte sur la page de suivi.
  if (!card || !card.active) return null;

  const ordersCount = await prisma.order.count({
    where: withStaffVisible({ customerId: card.customer.id }),
  });

  return {
    stampCount: card.stampCount,
    stampsPerCard: card.settings.stampsPerCard,
    tier1Stamps: card.settings.tier1Stamps,
    tier1RewardCap: card.settings.tier1RewardCap,
    tier2RewardCap: card.settings.tier2RewardCap,
    minOrderAmount: card.settings.minOrderAmount,
    availableRewardsCount: card.availableRewards.length,
    isFirstOrder: ordersCount <= 1,
  };
}
