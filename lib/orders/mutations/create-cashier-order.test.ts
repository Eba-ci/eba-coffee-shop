import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stock-history/record', async () =>
  (await import('@/lib/stock-history/test-mocks')).recordMock()
);
vi.mock('@/lib/stock-history/lifecycle', async () =>
  (await import('@/lib/stock-history/test-mocks')).lifecycleMock()
);
vi.mock('@/lib/stock-history/lock', async () =>
  (await import('@/lib/stock-history/test-mocks')).lockMock()
);

vi.mock('@/lib/prisma', async () =>
  (await import('./test-mocks')).prismaModuleMock()
);
vi.mock('@/lib/push-notify', async () =>
  (await import('./test-mocks')).pushNotifyModuleMock()
);
vi.mock('@/lib/customer-mutations', async () =>
  (await import('./test-mocks')).customerMutationsModuleMock()
);
vi.mock('@/lib/loyalty-mutations', async () =>
  (await import('./test-mocks')).loyaltyMutationsModuleMock()
);

vi.mock('@/lib/credits/spend', async (importOriginal) =>
  (await import('./test-mocks')).creditsSpendModuleMock(importOriginal as never)
);
import { createCashierOrder, StockShortageError } from '@/lib/order-mutations';
import type { CartItem } from '@/lib/cart-store';
import {
  mockOrderUpdateMany,
  mockOrderCreate,
  mockCustomerFindUnique,
  mockUpsertCustomer,
  mockProdUpdateMany,
  mockOptionFindFirst,
  mockOptionUpdateMany,
  mockSendPushToRoles,
  mockOrderUpdateManyWithClaim,
  orderWithOneItem,
} from './test-utils';
import { mockHoldCreditForCashier } from './test-mocks';

describe('createCashierOrder — ardoise du client de confiance', () => {
  const items = orderWithOneItem().items as unknown as CartItem[];

  /** Données passées à `order.create` au dernier appel. */
  const createdData = () =>
    (
      mockOrderCreate.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      }
    ).data;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertCustomer.mockResolvedValue('cust-1');
    mockOrderCreate.mockImplementation((async (args: {
      data: Record<string, unknown>;
    }) => ({
      id: 'order-new',
      dailyNumber: 5,
      reference: 'EBA-20260804-B7C1',
      total: 2500,
      customerName: 'Awa',
      items,
      status: (args.data.status as string) ?? 'NEW',
    })) as never);
    mockOrderUpdateManyWithClaim(1);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  it('client de confiance : commande créée directement en PREPARING, sur ardoise, stock réservé', async () => {
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: true } as never);

    await createCashierOrder({
      items,
      customerName: 'Awa',
      customerPhone: '0708090910',
      orderType: 'TAKEAWAY',
    });

    expect(createdData()).toMatchObject({
      status: 'PREPARING',
      preparingStartedAt: expect.any(Date),
      isOnAccount: true,
    });
    // Jamais payée : l'ardoise n'est pas un encaissement (le CA ne compte que
    // `isPaid`, cf. lib/stats.ts).
    expect(createdData()).not.toHaveProperty('isPaid');
    // Stock réservé dans la même transaction que la création.
    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'order-new', stockReservedAt: null },
      data: { stockReservedAt: expect.any(Date) },
    });
    expect(mockProdUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('client de confiance : la cuisine est prévenue, pas seulement la caisse', async () => {
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: true } as never);

    await createCashierOrder({
      items,
      customerPhone: '0708090910',
      orderType: 'TAKEAWAY',
    });

    expect(
      mockSendPushToRoles.mock.calls.find(
        ([, payload]) => payload.tag === 'order-kitchen-order-new'
      )
    ).toBeDefined();
  });

  it('client ordinaire, LIVRAISON : commande créée en NEW, sans ardoise ni réservation', async () => {
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: false } as never);

    await createCashierOrder({
      items,
      customerPhone: '0708090910',
      orderType: 'DELIVERY',
    });

    expect(createdData()).not.toHaveProperty('status');
    expect(createdData()).not.toHaveProperty('isOnAccount');
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
  });

  it('SUR PLACE ou À EMPORTER : départ direct en cuisine même pour un client ordinaire, non fiché', async () => {
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: false } as never);

    for (const orderType of ['DINE_IN', 'TAKEAWAY'] as const) {
      vi.clearAllMocks();
      mockUpsertCustomer.mockResolvedValue('cust-1');
      mockCustomerFindUnique.mockResolvedValue({ isTrusted: false } as never);
      mockOrderCreate.mockImplementation((async (args: {
        data: Record<string, unknown>;
      }) => ({
        id: 'order-new',
        dailyNumber: 5,
        reference: 'EBA-20260804-B7C1',
        total: 2500,
        customerName: 'Awa',
        items,
        status: (args.data.status as string) ?? 'NEW',
      })) as never);
      mockOrderUpdateManyWithClaim(1);
      mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
      mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
      mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);

      await createCashierOrder({
        items,
        customerPhone: '0708090910',
        orderType,
      });

      expect(createdData()).toMatchObject({
        status: 'PREPARING',
        preparingStartedAt: expect.any(Date),
        isOnAccount: true,
      });
      expect(mockProdUpdateMany).toHaveBeenCalledTimes(1);
    }
  });

  it('`onAccount: false` refuse le départ auto en cuisine même pour un sur-place/à-emporter', async () => {
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: false } as never);

    await createCashierOrder({
      items,
      customerPhone: '0708090910',
      orderType: 'TAKEAWAY',
      onAccount: false,
    });

    expect(createdData()).not.toHaveProperty('status');
    expect(createdData()).not.toHaveProperty('isOnAccount');
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
  });

  it('`onAccount` force l’ardoise pour un client non fiché de confiance (livraison)', async () => {
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: false } as never);

    await createCashierOrder({
      items,
      customerPhone: '0708090910',
      orderType: 'DELIVERY',
      onAccount: true,
    });

    expect(createdData()).toMatchObject({
      status: 'PREPARING',
      isOnAccount: true,
    });
  });

  it('commande ANTIDATÉE d’un client de confiance : PAS d’envoi auto en cuisine', async () => {
    // Une saisie de rattrapage n'est pas un événement en direct : elle ne doit
    // ni réveiller la cuisine ni décrémenter le stock d'aujourd'hui — même
    // garde que le push « nouvelle commande ».
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: true } as never);

    await createCashierOrder({
      items,
      customerPhone: '0708090910',
      orderType: 'TAKEAWAY',
      orderDate: '2026-01-05',
    });

    expect(createdData()).not.toHaveProperty('status');
    expect(createdData()).not.toHaveProperty('isOnAccount');
    expect(createdData()).toHaveProperty('createdAt');
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockSendPushToRoles).not.toHaveBeenCalled();
  });

  it('commande anonyme (sans téléphone), LIVRAISON : jamais d’ardoise implicite', async () => {
    mockUpsertCustomer.mockResolvedValue(null);

    await createCashierOrder({ items, orderType: 'DELIVERY' });

    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
    expect(createdData()).not.toHaveProperty('isOnAccount');
  });

  it('pénurie de stock : la création entière est annulée (rien n’est écrit)', async () => {
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: true } as never);
    mockProdUpdateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      createCashierOrder({
        items,
        customerPhone: '0708090910',
        orderType: 'TAKEAWAY',
      })
    ).rejects.toThrow(StockShortageError);
  });

  it('client identifié : l’avoir est retenu dès la création et porté sur la commande', async () => {
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: false } as never);
    mockHoldCreditForCashier.mockResolvedValueOnce(1000);

    const order = await createCashierOrder({
      items,
      customerPhone: '0708090910',
      orderType: 'DELIVERY',
    });

    expect(mockHoldCreditForCashier).toHaveBeenCalledWith(expect.anything(), {
      orderId: 'order-new',
      customerId: 'cust-1',
      total: 2500,
    });
    expect(order.creditApplied).toBe(1000);
  });

  it('commande anonyme ou antidatée : aucun avoir retenu', async () => {
    mockUpsertCustomer.mockResolvedValue(null);
    await createCashierOrder({ items, orderType: 'DELIVERY' });

    mockUpsertCustomer.mockResolvedValue('cust-1');
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: false } as never);
    await createCashierOrder({
      items,
      customerPhone: '0708090910',
      orderType: 'DELIVERY',
      orderDate: '2020-01-01',
    });

    expect(mockHoldCreditForCashier).not.toHaveBeenCalled();
  });
});
