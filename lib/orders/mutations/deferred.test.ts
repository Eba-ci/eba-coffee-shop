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
import {
  createCashierOrder,
  setOrderPayment,
  sendOrderToKitchen,
  StockShortageError,
} from '@/lib/order-mutations';
import type { CartItem } from '@/lib/cart-store';
import {
  mockOrderFindUnique,
  mockOrderCreate,
  mockCustomerFindUnique,
  mockUpsertCustomer,
  mockOrderPaymentCreateMany,
  mockProdUpdateMany,
  mockOptionFindFirst,
  mockOptionUpdateMany,
  mockProdUpdate,
  mockProdFindMany,
  mockOptionUpdate,
  mockOptionFindMany,
  mockOrderUpdateManyWithClaim,
  businessWrites,
  orderWithOneItem,
  tomorrowIso,
  laterTodayIso,
} from './test-utils';

describe('commande différée — création en caisse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateManyWithClaim(1);
    mockUpsertCustomer.mockResolvedValue('cust-1');
    mockCustomerFindUnique.mockResolvedValue({ isTrusted: true } as never);
    mockOrderCreate.mockImplementation((async (args: {
      data: Record<string, unknown>;
    }) => ({
      id: 'order-new',
      dailyNumber: 5,
      reference: 'EBA-20260804-B1C2',
      total: 2500,
      customerName: null,
      status: args.data.status ?? 'NEW',
      pickupTime: args.data.pickupTime ?? null,
      items: args.data.items,
    })) as never);
  });

  const items = [
    {
      cartId: 'c1',
      productId: 'p1',
      productName: 'Sponge cake',
      basePrice: 2500,
      coutMatiere: 0,
      coutEmballage: 0,
      quantity: 1,
      supplements: [],
      discount: 0,
      discountReason: null,
    },
  ] as CartItem[];

  it('client de confiance + retrait demain : reste NEW, aucun décrément de stock', async () => {
    await createCashierOrder({
      items,
      orderType: 'TAKEAWAY',
      customerPhone: '0700000000',
      pickupTime: tomorrowIso(),
    });

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: 'PREPARING' }),
      })
    );
    // Le stock d'aujourd'hui n'a pas bougé : la marchandise sera produite demain.
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    // `isOnAccount` n'est pas posé non plus : rien n'est parti en cuisine.
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ isOnAccount: true }),
      })
    );
  });

  it('non-régression — client de confiance + retrait TARDIF LE JOUR MÊME : part en cuisine et décompte', async () => {
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);

    await createCashierOrder({
      items,
      orderType: 'TAKEAWAY',
      customerPhone: '0700000000',
      pickupTime: laterTodayIso(),
    });

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PREPARING',
          isOnAccount: true,
        }),
      })
    );
    expect(mockProdUpdateMany).toHaveBeenCalled();
  });
});

describe('commande différée — encaissement purement financier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateManyWithClaim(1);
  });

  it('encaisser une commande NEW pour demain : ni PREPARING, ni décrément', async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...orderWithOneItem(),
      pickupTime: new Date(tomorrowIso()),
    } as never);
    mockOrderPaymentCreateMany.mockResolvedValue({ count: 1 } as never);

    const res = await setOrderPayment('order1', true, [
      { mode: 'CASH', amount: 2500 },
    ]);

    expect(res.startedPreparation).toBe(false);
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockOptionUpdateMany).not.toHaveBeenCalled();
    // Le paiement, lui, est bien écrit : c'est un encaissement, pas un refus.
    expect(businessWrites()[0]?.[0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ isPaid: true }),
      })
    );
    expect(businessWrites()[0]?.[0]).toEqual(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: 'PREPARING' }),
      })
    );
  });

  it('non-régression — encaisser une commande NEW du jour la pousse toujours en cuisine', async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...orderWithOneItem(),
      pickupTime: null,
    } as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-1' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOrderPaymentCreateMany.mockResolvedValue({ count: 1 } as never);

    const res = await setOrderPayment('order1', true, [
      { mode: 'CASH', amount: 2500 },
    ]);

    expect(res.startedPreparation).toBe(true);
    expect(mockProdUpdateMany).toHaveBeenCalled();
  });
});

describe('coverShortage — crédite le manquant puis réserve (net nul)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateManyWithClaim(1);
  });

  it('crédite EXACTEMENT ce qui manque, produit et goût, avant de décompter', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    // Stock courant : 0 produit, 1 goût — il faut 1 produit et 3 goûts.
    mockProdFindMany.mockResolvedValue([
      { id: 'p1', stockQuantity: 0 },
    ] as never);
    mockOptionFindMany.mockResolvedValue([
      { id: 'opt-1', stockQuantity: 1 },
    ] as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-1' } as never);
    mockProdUpdate.mockResolvedValue({} as never);
    mockOptionUpdate.mockResolvedValue({} as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);

    await sendOrderToKitchen('order1', 'ADMIN', { coverShortage: true });

    expect(mockProdUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: { increment: 1 } },
    });
    expect(mockOptionUpdate).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: { stockQuantity: { increment: 2 } },
    });
    // Puis le décrément normal : effet net nul sur le stock.
    expect(mockProdUpdateMany).toHaveBeenCalled();
  });

  it('ne crédite rien sur une cible à stock illimité (jamais en pénurie)', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    mockProdFindMany.mockResolvedValue([
      { id: 'p1', stockQuantity: null },
    ] as never);
    mockOptionFindMany.mockResolvedValue([
      { id: 'opt-1', stockQuantity: null },
    ] as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-1' } as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);

    await sendOrderToKitchen('order1', 'ADMIN', { coverShortage: true });

    expect(mockProdUpdate).not.toHaveBeenCalled();
    expect(mockOptionUpdate).not.toHaveBeenCalled();
  });

  it('sans confirmation, une pénurie reste un refus', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    mockProdUpdateMany.mockResolvedValue({ count: 0 } as never);

    await expect(sendOrderToKitchen('order1', 'ADMIN')).rejects.toBeInstanceOf(
      StockShortageError
    );
    expect(mockProdUpdate).not.toHaveBeenCalled();
  });
});

// ─── Édition d'articles : le stock suit le contenu réel de la commande ────────
