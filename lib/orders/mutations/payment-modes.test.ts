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

import {
  setOrderPayment,
  payAndComplete,
  OrderMutationError,
} from '@/lib/order-mutations';
import {
  mockOrderFindUnique,
  mockOrderUpdateMany,
  mockOrderPaymentCreateMany,
  mockOrderPaymentDeleteMany,
  mockProdUpdateMany,
  mockOptionFindFirst,
  mockOptionUpdateMany,
  isReservationClaim,
  mockOrderUpdateManyWithClaim,
  businessWrites,
  orderWithOneItem,
  tomorrowIso,
} from './test-utils';

describe('setOrderPayment — paiement fractionné', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  it('refuse (400) si la somme des paiements ne correspond pas au total', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    await expect(
      setOrderPayment('order1', true, [{ mode: 'CASH', amount: 1000 }])
    ).rejects.toThrow(OrderMutationError);
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
    expect(mockOrderPaymentCreateMany).not.toHaveBeenCalled();
  });

  it('2 moyens distincts : crée une ligne OrderPayment par moyen et laisse paymentMode=null', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    await setOrderPayment('order1', true, [
      { mode: 'CASH', amount: 1000 },
      { mode: 'WAVE', amount: 1500 },
    ]);

    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPaid: true, paymentMode: null }),
      })
    );
    expect(mockOrderPaymentCreateMany).toHaveBeenCalledWith({
      data: [
        { orderId: 'order1', mode: 'CASH', amount: 1000, createdById: null },
        { orderId: 'order1', mode: 'WAVE', amount: 1500, createdById: null },
      ],
    });
  });

  it('un seul moyen (même fractionné en 2 lignes du même mode) : paymentMode reste renseigné', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    await setOrderPayment('order1', true, [
      { mode: 'CASH', amount: 1000 },
      { mode: 'CASH', amount: 1500 },
    ]);

    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPaid: true, paymentMode: 'CASH' }),
      })
    );
  });
});

describe('setOrderPayment — acompte commande spéciale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  // Un règlement intégral doit couvrir l'acompte, puisqu'il couvre le total
  // (cf. le commentaire de `sendOrderToKitchen`) : sans `depositPaid` aligné
  // sur `depositRequired`, une commande à acompte payée en une fois AVANT son
  // entrée en cuisine (typiquement un retrait différé, où `startedPreparation`
  // est faux malgré `isPaid: true`) restait bloquée en 409 « acompte requis »
  // le jour du retrait, alors même qu'elle était déjà soldée.
  it('un paiement intégral aligne depositPaid sur le total quand un acompte est requis', async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...orderWithOneItem(),
      depositRequired: 1250,
      depositPaid: 0,
    } as never);

    await setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }]);

    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isPaid: true,
          depositPaid: 2500,
          depositPaidAt: expect.any(Date),
        }),
      })
    );
  });

  it("n'écrit pas depositPaid quand la commande n'exige pas d'acompte", async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    await setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }]);

    const [{ data }] = businessWrites()[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data).not.toHaveProperty('depositPaid');
    expect(data).not.toHaveProperty('depositPaidAt');
  });
});

describe('setOrderPayment — dépaiement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('supprime les lignes OrderPayment existantes au dépaiement', async () => {
    mockOrderFindUnique.mockResolvedValue({ isPaid: true } as never);
    mockOrderUpdateMany.mockResolvedValue({ count: 1 } as never);

    const result = await setOrderPayment('order1', false);

    expect(result).toEqual({ startedPreparation: false });
    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'order1', isPaid: true },
      data: {
        isPaid: false,
        paymentMode: null,
        paidAt: null,
        paymentAutoValidatedByAi: false,
        depositPaid: 0,
        depositPaidAt: null,
      },
    });
    expect(mockOrderPaymentDeleteMany).toHaveBeenCalledWith({
      where: { orderId: 'order1' },
    });
  });
});

describe('setOrderPayment — course avec l’expiration d’un paiement en ligne', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-1' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOrderPaymentCreateMany.mockResolvedValue({ count: 1 } as never);
  });

  it('garde sur le statut NEW l’encaissement qui pousse la commande en cuisine', async () => {
    mockOrderUpdateManyWithClaim(1);
    mockOrderFindUnique.mockResolvedValue({
      ...orderWithOneItem(),
      pickupTime: null,
    } as never);

    await setOrderPayment('order1', true, [{ mode: 'WAVE', amount: 2500 }]);

    expect(businessWrites()[0]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'order1',
          isPaid: false,
          status: 'NEW',
        }),
      })
    );
  });

  it('une commande annulée entre la lecture et l’écriture n’est PAS ressuscitée en cuisine', async () => {
    // Simule la base : l'expiration a déjà passé la commande à CANCELLED, donc
    // une écriture gardée sur `status: 'NEW'` ne trouve plus rien.
    mockOrderUpdateMany.mockImplementation((async (args: {
      where?: { status?: string };
    }) =>
      isReservationClaim(args)
        ? { count: 1 }
        : { count: args.where?.status === 'NEW' ? 0 : 1 }) as never);
    mockOrderFindUnique.mockResolvedValue({
      ...orderWithOneItem(),
      pickupTime: null,
    } as never);

    await expect(
      setOrderPayment('order1', true, [{ mode: 'WAVE', amount: 2500 }])
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(mockOrderPaymentCreateMany).not.toHaveBeenCalled();
  });

  it('une commande déjà annulée reste encaissable (paiement tardif) : pas de garde de statut', async () => {
    mockOrderUpdateManyWithClaim(1);
    mockOrderFindUnique.mockResolvedValue({
      ...orderWithOneItem({}, { status: 'CANCELLED' }),
      pickupTime: null,
    } as never);

    const res = await setOrderPayment('order1', true, [
      { mode: 'WAVE', amount: 2500 },
    ]);

    expect(res.startedPreparation).toBe(false);
    const where = businessWrites()[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(where.where).not.toHaveProperty('status');
  });
});

describe('payAndComplete — refus explicite sur une commande différée', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateManyWithClaim(1);
  });

  it('refuse « payer + récupérer » tant que rien n’a été produit', async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...orderWithOneItem(),
      pickupTime: new Date(tomorrowIso()),
      stockReservedAt: null,
    } as never);

    await expect(
      payAndComplete('order1', [{ mode: 'CASH', amount: 2500 }], 'ADMIN')
    ).rejects.toThrow(/Retrait prévu/);
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
  });

  it('l’autorise si la commande a été PRÉPARÉE EN AVANCE (stock déjà réservé)', async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...orderWithOneItem(),
      pickupTime: new Date(tomorrowIso()),
      stockReservedAt: new Date(),
    } as never);
    mockOrderUpdateManyWithClaim(0); // déjà réservé : le verrou ne se reprend pas
    mockOrderPaymentCreateMany.mockResolvedValue({ count: 1 } as never);

    await expect(
      payAndComplete('order1', [{ mode: 'CASH', amount: 2500 }], 'ADMIN')
    ).resolves.toEqual({ alreadyPaid: false });
  });
});

// ─── Couverture de pénurie : le staff confirme avoir produit ──────────────────
