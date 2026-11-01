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
  sendOrderToKitchen,
  OrderMutationError,
  StockShortageError,
} from '@/lib/order-mutations';
import {
  mockOrderFindUnique,
  mockOrderUpdateMany,
  mockProdUpdateMany,
  mockOptionFindFirst,
  mockOptionUpdateMany,
  mockNotifyOrderCustomer,
  mockSendPushToRoles,
  mockOrderUpdateManyWithClaim,
  businessWrites,
  orderWithOneItem,
} from './test-utils';

describe('payAndComplete — réservation inconditionnelle du stock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  // NEW → COMPLETED ne passe jamais par PREPARING, mais la marchandise est
  // bien servie : elle doit être décomptée.
  it('commande NEW : réserve le stock puis finalise en un geste', async () => {
    mockOrderUpdateManyWithClaim(1);
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    const result = await payAndComplete(
      'order1',
      [{ mode: 'CASH', amount: 2500 }],
      'ADMIN'
    );

    expect(result).toEqual({ alreadyPaid: false });
    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'order1', stockReservedAt: null },
      data: { stockReservedAt: expect.any(Date) },
    });
    expect(mockProdUpdateMany).toHaveBeenCalledTimes(1);
    expect(businessWrites()).toHaveLength(1);
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', isPaid: true }),
      })
    );
  });

  // Ancienne exception « déjà COMPLETED ⇒ pas de décrément » : elle n'existe
  // plus en tant que telle, c'est le verrou `stockReservedAt` qui tranche.
  it('commande déjà COMPLETED dont le stock est déjà réservé : encaisse sans décrémenter', async () => {
    mockOrderUpdateManyWithClaim(0);
    mockOrderFindUnique.mockResolvedValue(
      orderWithOneItem({}, { status: 'COMPLETED' }) as never
    );

    const result = await payAndComplete(
      'order1',
      [{ mode: 'CASH', amount: 2500 }],
      'ADMIN'
    );

    expect(result).toEqual({ alreadyPaid: false });
    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockOptionFindFirst).not.toHaveBeenCalled();
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', isPaid: true }),
      })
    );
  });
});

describe('sendOrderToKitchen — entrée en cuisine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  it('réserve le stock et pousse la commande en PREPARING', async () => {
    mockOrderUpdateManyWithClaim(1);
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    await sendOrderToKitchen('order1', 'ADMIN');

    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'order1', stockReservedAt: null },
      data: { stockReservedAt: expect.any(Date) },
    });
    expect(mockProdUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order1', status: 'NEW' },
        data: expect.objectContaining({
          status: 'PREPARING',
          preparingStartedAt: expect.any(Date),
        }),
      })
    );
    // Pas d'ardoise sans `onAccount` : le champ n'est même pas écrit.
    expect(businessWrites()[0][0]).not.toHaveProperty('data.isOnAccount');
  });

  it('entrer deux fois en cuisine ne décrémente le stock qu’une seule fois', async () => {
    // 1er envoi : le verrou est libre, le stock part.
    mockOrderUpdateManyWithClaim(1);
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);
    await sendOrderToKitchen('order1', 'ADMIN');
    expect(mockProdUpdateMany).toHaveBeenCalledTimes(1);

    // 2e envoi (undo PREPARING → NEW puis renvoi) : la revendication renvoie
    // count: 0, donc plus AUCUN décrément — mais le statut est bien réécrit.
    mockProdUpdateMany.mockClear();
    mockOptionUpdateMany.mockClear();
    mockOrderUpdateManyWithClaim(0);
    await sendOrderToKitchen('order1', 'ADMIN');

    expect(mockProdUpdateMany).not.toHaveBeenCalled();
    expect(mockOptionUpdateMany).not.toHaveBeenCalled();
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PREPARING' }),
      })
    );
  });

  it('marque isOnAccount quand l’envoi est une ardoise', async () => {
    mockOrderUpdateManyWithClaim(1);
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    await sendOrderToKitchen('order1', 'ADMIN', { onAccount: true });

    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PREPARING',
          isOnAccount: true,
        }),
      })
    );
  });

  it('pénurie : rollback (aucune écriture de statut) et notification ITEM_UNAVAILABLE', async () => {
    mockOrderUpdateManyWithClaim(1);
    mockOrderFindUnique.mockResolvedValue(
      orderWithOneItem({ supplements: [] }) as never
    );
    mockProdUpdateMany.mockResolvedValue({ count: 0 } as never);

    await expect(sendOrderToKitchen('order1', 'ADMIN')).rejects.toThrow(
      StockShortageError
    );

    expect(businessWrites()).toHaveLength(0);
    expect(mockNotifyOrderCustomer).toHaveBeenCalledWith(
      'order1',
      'ITEM_UNAVAILABLE'
    );
    expect(mockNotifyOrderCustomer).not.toHaveBeenCalledWith(
      'order1',
      'PREPARING'
    );
  });

  it('refuse (403) une transition non autorisée pour le rôle', async () => {
    mockOrderUpdateManyWithClaim(1);
    mockOrderFindUnique.mockResolvedValue(
      orderWithOneItem({}, { status: 'READY' }) as never
    );

    // READY → PREPARING est réservé à KITCHEN_PLUS : COMPTABLE n'y a pas droit.
    await expect(sendOrderToKitchen('order1', 'COMPTABLE')).rejects.toThrow(
      OrderMutationError
    );
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });

  it('lève (404) si la commande est introuvable', async () => {
    mockOrderFindUnique.mockResolvedValue(null);

    await expect(sendOrderToKitchen('order1', 'ADMIN')).rejects.toThrow(
      OrderMutationError
    );
  });
});

describe('notification push cuisine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProdUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOptionFindFirst.mockResolvedValue({ id: 'opt-active' } as never);
    mockOptionUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockOrderUpdateManyWithClaim(1);
  });

  const kitchenPush = () =>
    mockSendPushToRoles.mock.calls.find(
      ([, payload]) => payload.tag === 'order-kitchen-order1'
    );

  it('cible le staff cuisine (KITCHEN) et JAMAIS le caissier (déjà notifié)', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    await sendOrderToKitchen('order1', 'ADMIN');

    const call = kitchenPush();
    expect(call).toBeDefined();
    const [roles, payload] = call as [string[], { body: string; url?: string }];
    expect(roles).toContain('KITCHEN');
    expect(roles).not.toContain('CASHIER');
    expect(payload.url).toBe('/dashboard/preparation');
    expect(payload.body).toBe('#003 · A3F9 · 1 article');
  });

  it('l’encaissement qui pousse une commande NEW en cuisine notifie aussi la cuisine', async () => {
    mockOrderFindUnique.mockResolvedValue(orderWithOneItem() as never);

    await setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }]);

    expect(kitchenPush()).toBeDefined();
  });

  it('encaisser une commande déjà en cuisine ne renotifie pas la cuisine', async () => {
    mockOrderFindUnique.mockResolvedValue(
      orderWithOneItem({}, { status: 'PREPARING' }) as never
    );

    await setOrderPayment('order1', true, [{ mode: 'CASH', amount: 2500 }]);

    expect(kitchenPush()).toBeUndefined();
  });
});
