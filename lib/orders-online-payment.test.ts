// lib/orders-online-payment.test.ts
//
// `createOrder` avec paiement en ligne (Jèko). Le paramètre `onlinePayment` est
// optionnel : SANS lui, la commande reste exactement celle d'avant (pas de
// vérification du panier, pas de frais, notification staff immédiate). AVEC lui :
//   - le panier est vérifié contre le menu AVANT toute écriture ;
//   - les frais se calculent sur le total NET (après récompense fidélité) et sont
//     posés dans la MÊME transaction que la création, avec l'échéance de paiement ;
//   - la commande n'est pas annoncée au staff : elle est invisible tant qu'elle
//     n'est pas payée, la notification part au règlement (lib/jeko/settle.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  order: { create: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  },
}));
vi.mock('@/lib/daily-numbering', () => ({
  getNextDailyNumber: vi.fn().mockResolvedValue(7),
  todayDailyDate: () => new Date('2026-10-03T00:00:00.000Z'),
}));
vi.mock('@/lib/customer-mutations', () => ({
  upsertCustomerForOrder: vi.fn().mockResolvedValue('cust-1'),
}));
vi.mock('@/lib/loyalty-mutations', () => ({
  awardLoyaltyForOrder: vi.fn().mockResolvedValue({ rewards: [] }),
  consumeLoyaltyReward: vi.fn().mockResolvedValue(undefined),
  resolveLoyaltyReward: vi.fn(),
}));
vi.mock('@/lib/loyalty', () => ({
  getLoyaltyCard: vi.fn(),
  getLoyaltyCardByPhone: vi.fn(),
}));
vi.mock('@/lib/push-notify', () => ({ sendPushToRoles: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({
  ROLE_GROUPS: { DASHBOARD: ['ADMIN'] },
}));
vi.mock('@/lib/orders/availability', () => ({
  fetchStockSnapshot: vi.fn(),
  computeOrderItemsAvailability: vi.fn(),
  buildSoldOutLines: vi.fn(),
  fetchAdvanceOrderSnapshot: vi.fn().mockResolvedValue({}),
  maxRequiredAdvanceOrderDays: vi.fn().mockReturnValue(0),
  fetchScheduleSnapshot: vi.fn().mockResolvedValue({}),
  findScheduleBlockedItem: vi.fn().mockReturnValue(null),
  findNonPreorderableNames: vi.fn().mockResolvedValue([]),
}));
// Retrait différé : le contrôle de stock du jour est sans objet ici.
vi.mock('@/lib/orders/scheduling', () => ({
  isDeferredPickup: vi.fn().mockReturnValue(true),
}));
// `lib/order-mutations.ts` importe lui-même `generateOrderReference` depuis ce
// fichier (`lib/orders.ts`) : un `importOriginal` ici rechargerait le vrai
// module en plein cycle avec celui sous test. On simule donc entièrement
// `reserveStockOnce` avec sa propre erreur de pénurie (la vraie
// `StockShortageError` n'a pas besoin d'être cette classe précise ici — seul
// son httpStatus 409 compte pour `publicOrderErrorResponse`).
class FakeStockShortageError extends Error {
  httpStatus = 409;
}
vi.mock('@/lib/order-mutations', () => ({
  reserveStockOnce: vi.fn(),
}));

import {
  awardLoyaltyForOrder,
  consumeLoyaltyReward,
  resolveLoyaltyReward,
} from '@/lib/loyalty-mutations';
import { sendPushToRoles } from '@/lib/push-notify';
import { isDeferredPickup } from '@/lib/orders/scheduling';
import { reserveStockOnce } from '@/lib/order-mutations';
import { CartMismatchError } from '@/lib/orders/cart-verification';
import {
  fetchStockSnapshot,
  computeOrderItemsAvailability,
} from '@/lib/orders/availability';
import { createOrder } from './orders';

const menu = [
  {
    products: [{ id: 'p1', price: 3500, supplements: [] }],
  },
] as never;

const input = {
  customerName: 'Kofi Yao',
  customerPhone: '+2250701020304',
  items: [
    {
      cartId: 'c1',
      productId: 'p1',
      productName: 'Gâteau',
      basePrice: 3500,
      quantity: 1,
      supplements: [],
      discount: 0,
    },
  ],
  total: 3500,
} as never;

const expiresAt = new Date('2026-10-03T12:15:00.000Z');
const online = { feePercent: 1, expiresAt, menu };

function createdOrder(total: number) {
  return {
    id: 'o1',
    reference: 'EBA-20261003-AB12',
    dailyNumber: 7,
    customerName: 'Kofi Yao',
    orderType: 'TAKEAWAY',
    total,
  };
}

describe('createOrder avec paiement en ligne', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendPushToRoles).mockResolvedValue(undefined as never);
    tx.order.create.mockResolvedValue(createdOrder(3500));
    tx.order.update.mockImplementation(async ({ data }) => ({
      ...createdOrder(3500),
      ...data,
    }));
  });

  it('pose les frais (1 % du total) et l’échéance dans la transaction de création', async () => {
    const order = await createOrder(input, { onlinePayment: online });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { onlineFee: 35, paymentExpiresAt: expiresAt },
    });
    expect(order).toMatchObject({ onlineFee: 35, paymentExpiresAt: expiresAt });
  });

  it('calcule les frais sur le total NET, après la récompense fidélité', async () => {
    vi.mocked(resolveLoyaltyReward).mockResolvedValue({
      id: 'r1',
      capAmount: 500,
    });
    tx.order.create.mockResolvedValue(createdOrder(3000));
    tx.order.update.mockImplementation(async ({ data }) => ({
      ...createdOrder(3000),
      ...data,
    }));

    await createOrder(
      { ...(input as object), loyaltyRewardId: 'r1' } as never,
      { onlinePayment: online }
    );

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: 3000 }),
      })
    );
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { onlineFee: 30, paymentExpiresAt: expiresAt },
    });
  });

  it('refuse un total falsifié AVANT toute écriture', async () => {
    await expect(
      createOrder({ ...(input as object), total: 1 } as never, {
        onlinePayment: online,
      })
    ).rejects.toBeInstanceOf(CartMismatchError);

    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('ne demande aucun paiement quand la récompense couvre toute la commande', async () => {
    vi.mocked(resolveLoyaltyReward).mockResolvedValue({
      id: 'r1',
      capAmount: 5000,
    });
    tx.order.create.mockResolvedValue(createdOrder(0));

    await createOrder(
      { ...(input as object), loyaltyRewardId: 'r1' } as never,
      { onlinePayment: online }
    );

    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("n'annonce pas au staff une commande qui n'est pas encore payée", async () => {
    await createOrder(input, { onlinePayment: online });
    expect(sendPushToRoles).not.toHaveBeenCalled();
  });
});

describe('createOrder sans paiement en ligne', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendPushToRoles).mockResolvedValue(undefined as never);
    tx.order.create.mockResolvedValue(createdOrder(3500));
  });

  it('reste inchangé : aucun frais, aucune échéance, staff prévenu aussitôt', async () => {
    await createOrder(input);

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(sendPushToRoles).toHaveBeenCalledTimes(1);
  });

  it('ne vérifie pas le panier (comportement historique)', async () => {
    await expect(
      createOrder({ ...(input as object), total: 1 } as never)
    ).resolves.toBeDefined();
  });
});

describe('createOrder — réservation anticipée du stock (retrait aujourd’hui)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendPushToRoles).mockResolvedValue(undefined as never);
    vi.mocked(isDeferredPickup).mockReturnValue(false);
    vi.mocked(reserveStockOnce).mockResolvedValue(true);
    // `assertPublicOrderConstraints` vérifie aussi le stock du jour (lecture
    // seule) avant la réservation atomique testée ici — sans objet pour ces
    // tests, qui portent sur la réservation elle-même.
    vi.mocked(fetchStockSnapshot).mockResolvedValue({
      products: new Map(),
      options: new Map(),
    });
    vi.mocked(computeOrderItemsAvailability).mockReturnValue({
      fulfillable: true,
      items: [],
    } as never);
    tx.order.create.mockResolvedValue(createdOrder(3500));
    tx.order.update.mockImplementation(async ({ data }) => ({
      ...createdOrder(3500),
      ...data,
    }));
  });

  it('réserve le stock des articles dès la création', async () => {
    const order = await createOrder(input, { onlinePayment: online });

    expect(reserveStockOnce).toHaveBeenCalledWith(tx, order.id, input.items);
  });

  it('ne réserve rien pour une commande différée', async () => {
    vi.mocked(isDeferredPickup).mockReturnValue(true);

    await createOrder(input, { onlinePayment: online });

    expect(reserveStockOnce).not.toHaveBeenCalled();
  });

  it('ne réserve rien quand la récompense couvre tout le total (pas de paiement en attente)', async () => {
    vi.mocked(resolveLoyaltyReward).mockResolvedValue({
      id: 'r1',
      capAmount: 5000,
    });
    tx.order.create.mockResolvedValue(createdOrder(0));

    await createOrder(
      { ...(input as object), loyaltyRewardId: 'r1' } as never,
      { onlinePayment: online }
    );

    expect(reserveStockOnce).not.toHaveBeenCalled();
  });

  it('une pénurie à la réservation fait échouer la création, avant tout paiement', async () => {
    vi.mocked(reserveStockOnce).mockRejectedValue(
      new FakeStockShortageError('Stock insuffisant pour « Gâteau »')
    );

    await expect(createOrder(input, { onlinePayment: online })).rejects.toThrow(
      'Stock insuffisant pour « Gâteau »'
    );
  });
});

// Fidélité : en paiement en ligne le tampon n'est accordé qu'AU PAIEMENT
// (`awardLoyaltyOnPayment`). La réduction que la commande en cours débloquerait
// n'est donc jamais déduite du montant Jèko, figé à la création : le récapitulatif
// du checkout ne doit pas la déduire non plus (`lib/loyalty-checkout.ts`).
describe('createOrder — réduction débloquée par la commande en cours', () => {
  const unlocked = {
    rewards: [{ id: 'r1', tier: 5, capAmount: 1000 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendPushToRoles).mockResolvedValue(undefined as never);
    vi.mocked(awardLoyaltyForOrder).mockResolvedValue(unlocked as never);
    // Un test précédent a fait échouer la réservation : on repart d'un état sain.
    vi.mocked(reserveStockOnce).mockResolvedValue(undefined as never);
    tx.order.create.mockResolvedValue(createdOrder(3500));
    tx.order.update.mockImplementation(async ({ data }) => ({
      ...createdOrder(3500),
      ...data,
    }));
  });

  it('en ligne : pas de tampon à la création, total et frais calculés sur le total plein', async () => {
    const order = await createOrder(input, { onlinePayment: online });

    expect(awardLoyaltyForOrder).not.toHaveBeenCalled();
    expect(consumeLoyaltyReward).not.toHaveBeenCalled();
    // Seule mise à jour : frais (1 % de 3500) + échéance, jamais de remise.
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { onlineFee: 35, paymentExpiresAt: expiresAt },
    });
    expect(order.total).toBe(3500);
    expect(order).not.toHaveProperty('loyaltyDiscount');
  });

  it('hors ligne : le tampon est accordé à la création et la réduction débloquée est appliquée d’office', async () => {
    const order = await createOrder(input);

    expect(awardLoyaltyForOrder).toHaveBeenCalledTimes(1);
    expect(consumeLoyaltyReward).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ rewardId: 'r1', capAmount: 1000 })
    );
    expect(order.total).toBe(2500);
  });
});
