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

import { setOrderPayment, StockShortageError } from '@/lib/order-mutations';
import {
  mockOrderFindUnique,
  mockOrderUpdateMany,
  mockProdUpdateMany,
  mockOptionFindFirst,
  mockOptionUpdateMany,
  isReservationClaim,
  mockOrderUpdateManyWithClaim,
  businessWrites,
  orderWithOneItem,
} from './test-utils';

describe('setOrderPayment — réservation du stock à l’entrée en cuisine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Commande NEW : l'encaissement la pousse en cuisine, donc réserve.
    mockOrderUpdateManyWithClaim(1);
  });

  it('résout l’option par nom en ne considérant QUE les options disponibles (évite le doublon désactivé)', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);

    await setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }]);

    expect(mockOptionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: 'Cacahuète vanille',
          available: true,
          group: {
            name: 'Choisissez vos goûts',
            OR: [{ productId: 'p1' }, { isGlobal: true }],
          },
        }),
      })
    );
    // Le décrément cible l'id résolu, jamais un match par nom pouvant
    // toucher plusieurs lignes à la fois (cf. bug historique : un doublon
    // désactivé partageant le nom faisait échouer le paiement à tort).
    expect(mockOptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'opt-active' }),
      })
    );
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPaid: true }),
      })
    );
  });

  it("remet paymentExpiresAt à nul à l'encaissement : un dépaiement ne cache plus la commande", async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);

    await setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }]);

    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPaid: true, paymentExpiresAt: null }),
      })
    );
  });

  it('écrit transaction et frais Jèko dans la même écriture que isPaid (règlement en ligne)', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
    const online = {
      gatewayFee: 52,
      paymentRequestId: 'pr_1',
      paymentTransactionId: 'txn_1',
    };

    await setOrderPayment(
      'order1',
      true,
      [{ mode: 'CASH', amount: 2500 }],
      null,
      { online }
    );

    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPaid: true, ...online }),
      })
    );
  });

  it('refuse le paiement (409) si aucune option disponible ne correspond au nom', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue(null);

    await expect(
      setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }])
    ).rejects.toThrow(StockShortageError);
    // Le flip isPaid n'a jamais lieu : rien n'est encaissé sur un refus. (La
    // revendication du verrou, elle, a bien été émise — le rollback de la
    // transaction l'annule.)
    expect(businessWrites()).toHaveLength(0);
  });

  it('refuse le paiement (409) si le stock produit est insuffisant', async () => {
    mockOrderFindUnique.mockResolvedValue(
      orderWithOneItem({ supplements: [] }) as never
    );
    mockProdUpdateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }])
    ).rejects.toThrow(StockShortageError);
    expect(mockOptionFindFirst).not.toHaveBeenCalled();
    expect(businessWrites()).toHaveLength(0);
  });

  it('refuse le paiement (409) si le stock de l’option est insuffisant', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }])
    ).rejects.toThrow(StockShortageError);
    expect(businessWrites()).toHaveLength(0);
  });

  it('produit à stock illimité (aucun supplément) : décrémente sans résoudre d’option', async () => {
    mockOrderFindUnique.mockResolvedValue(
      orderWithOneItem({ supplements: [] }) as never
    );
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);

    await setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }]);

    expect(mockOptionFindFirst).not.toHaveBeenCalled();
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPaid: true }),
      })
    );
  });

  // Encaisser une commande qui n'est plus NEW (déjà en cuisine, prête ou
  // récupérée) est PUREMENT financier : plus aucun appel stock, même pas la
  // revendication du verrou. C'est la nouvelle règle — l'ancienne exception
  // « ne pas décrémenter si COMPLETED » est subsumée par `stockReservedAt`.
  it('commande déjà COMPLETED : encaisse sans aucun appel stock', async () => {
    mockOrderFindUnique.mockResolvedValue(
      orderWithOneItem({}, { status: 'COMPLETED' }) as never
    );

    await setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }]);

    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockOptionFindFirst).not.toHaveBeenCalled();
    expect(mockOptionUpdateMany).not.toHaveBeenCalled();
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPaid: true }),
      })
    );
  });

  it('skipKitchen : encaisse une commande NEW sans la pousser en cuisine ni toucher au stock', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    const result = await setOrderPayment(
      'order1',
      true,
      [{ mode: 'WAVE', amount: 2500 }],
      null,
      { skipKitchen: true }
    );

    expect(result).toEqual({ startedPreparation: false });
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockOptionUpdateMany).not.toHaveBeenCalled();
    const paid = mockOrderUpdateMany.mock.calls.find(
      ([args]) => (args as { data?: { isPaid?: boolean } }).data?.isPaid
    )?.[0] as { data: Record<string, unknown> };
    expect(paid.data).not.toHaveProperty('status');
  });

  it('commande déjà en cuisine (PREPARING) : l’encaissement ne touche pas au stock', async () => {
    mockOrderFindUnique.mockResolvedValue(
      orderWithOneItem({}, { status: 'PREPARING' }) as never
    );

    const result = await setOrderPayment('order1', true, [
      { mode: 'CASH', amount: 2500 },
    ]);

    expect(result).toEqual({ startedPreparation: false });
    // Ni revendication du verrou, ni décrément : le stock a été réservé à
    // l'entrée en cuisine, l'encaissement n'est plus qu'un mouvement d'argent.
    expect(
      mockOrderUpdateMany.mock.calls.filter(([args]) =>
        isReservationClaim(args)
      )
    ).toHaveLength(0);
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockOptionFindFirst).not.toHaveBeenCalled();
  });
});
