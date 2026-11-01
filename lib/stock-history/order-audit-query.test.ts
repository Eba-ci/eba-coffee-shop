import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    order: { findMany: vi.fn() },
    stockMovement: { findMany: vi.fn(), aggregate: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/orders/mutations/stock-needs', () => ({
  aggregateStockNeeds: vi.fn(),
}));

import prisma from '@/lib/prisma';
import { aggregateStockNeeds } from '@/lib/orders/mutations/stock-needs';
import { loadOrderLedger } from './order-audit-query';

const queryRaw = vi.mocked(prisma.$queryRaw);
const orderFindMany = vi.mocked(prisma.order.findMany);
const moveFindMany = vi.mocked(prisma.stockMovement.findMany);
const moveAggregate = vi.mocked(prisma.stockMovement.aggregate);
const needs = vi.mocked(aggregateStockNeeds);

const START = new Date('2026-11-01T10:00:00Z');
const AFTER = new Date('2026-11-01T12:00:00Z');

function order(id: string, n: number, over: Record<string, unknown> = {}) {
  return {
    id,
    dailyNumber: n,
    reference: `EBA-20261101-${String(n).padStart(4, '0')}`,
    customerName: n === 1 ? 'Awa K.' : null,
    createdAt: AFTER,
    status: 'COMPLETED',
    isPaid: true,
    pickupTime: null,
    stockReservedAt: AFTER,
    items: [
      { productId: 'p1', productName: 'Crêpe', quantity: 2, supplements: [] },
    ],
    stockHolds: [],
    ...over,
  };
}

function move(
  orderId: string,
  delta: number,
  over: Record<string, unknown> = {}
) {
  return {
    id: `m-${orderId}-${delta}`,
    createdAt: AFTER,
    kind: 'PRODUCT',
    resourceId: 'p1',
    label: 'Crêpe',
    reason: 'ORDER_KITCHEN',
    source: 'STAFF',
    delta,
    before: 10,
    after: 10 + delta,
    orderId,
    actorId: null,
    ...over,
  };
}

function setupNeeds(extraOptions: [string, number][] = []) {
  needs.mockResolvedValue({
    products: new Map([['p1', { name: 'Crêpe', needed: 2 }]]),
    options: new Map(
      extraOptions.map(([id, n]) => [
        id,
        { productName: 'Crêpe', groupName: 'Goûts', optionName: id, needed: n },
      ])
    ),
    unresolved: new Map(),
  } as never);
}

describe('loadOrderLedger', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    moveAggregate.mockResolvedValue({ _min: { createdAt: START } } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    queryRaw
      .mockResolvedValueOnce([{ id: 'o1' }, { id: 'o2' }] as never)
      .mockResolvedValueOnce([{ n: BigInt(2) }] as never);
    setupNeeds();
  });

  it('lancée et décomptée : ok ; lancée sans mouvement : défaut', async () => {
    orderFindMany.mockResolvedValue([order('o1', 1), order('o2', 2)] as never);
    moveFindMany.mockResolvedValue([move('o1', -2)] as never);

    const res = await loadOrderLedger({}, 'audit');
    const byId = Object.fromEntries(res.orders.map((o) => [o.id, o]));
    expect(byId.o1.explanation.code).toBe('counted');
    expect(byId.o2.explanation.code).toBe('missing');
    expect(byId.o2.defect).toBe(true);
    expect(res).toMatchObject({ examined: 2, defects: 1, total: 2 });
  });

  it('chaque commande porte son code et le nom du client pour la reconnaître', async () => {
    orderFindMany.mockResolvedValue([order('o1', 1), order('o2', 2)] as never);
    moveFindMany.mockResolvedValue([move('o1', -2)] as never);
    const res = await loadOrderLedger({}, 'audit');
    const byId = Object.fromEntries(res.orders.map((o) => [o.id, o]));
    expect(byId.o1).toMatchObject({
      reference: 'EBA-20261101-0001',
      customerName: 'Awa K.',
    });
    expect(byId.o2.customerName).toBeNull();
  });

  it('onlyIssues ne garde que les défauts et avertissements, mais compte tout', async () => {
    orderFindMany.mockResolvedValue([order('o1', 1), order('o2', 2)] as never);
    moveFindMany.mockResolvedValue([move('o1', -2)] as never);

    const res = await loadOrderLedger({ onlyIssues: true }, 'audit');
    expect(res.orders.map((o) => o.id)).toEqual(['o2']);
    expect(res.examined).toBe(2);
  });

  it('servie sans jamais avoir été lancée : défaut', async () => {
    orderFindMany.mockResolvedValue([
      order('o1', 1, { stockReservedAt: null }),
      order('o2', 2),
    ] as never);
    moveFindMany.mockResolvedValue([move('o2', -2)] as never);

    const res = await loadOrderLedger({}, 'audit');
    expect(res.orders.find((o) => o.id === 'o1')?.explanation.code).toBe(
      'served_without_stock'
    );
  });

  it('lancée avant le début du journal : non vérifiable, pas un défaut', async () => {
    orderFindMany.mockResolvedValue([
      order('o1', 1, {
        stockReservedAt: new Date('2026-10-31T09:00:00Z'),
        createdAt: new Date('2026-10-31T09:00:00Z'),
      }),
      order('o2', 2),
    ] as never);
    moveFindMany.mockResolvedValue([move('o2', -2)] as never);

    const res = await loadOrderLedger({}, 'audit');
    const o1 = res.orders.find((o) => o.id === 'o1')!;
    expect(o1.explanation.code).toBe('before_journal');
    expect(o1.defect).toBe(false);
  });

  it('aucun mouvement hors relevé de départ : tout est « avant le journal »', async () => {
    moveAggregate.mockResolvedValue({ _min: { createdAt: null } } as never);
    orderFindMany.mockResolvedValue([order('o1', 1), order('o2', 2)] as never);
    moveFindMany.mockResolvedValue([] as never);

    const res = await loadOrderLedger({}, 'audit');
    expect(res.journalStart).toBeNull();
    expect(res.defects).toBe(0);
  });

  it('les réservations et la production déclarée sont comptées comme il faut', async () => {
    orderFindMany.mockResolvedValue([order('o1', 1), order('o2', 2)] as never);
    moveFindMany.mockResolvedValue([
      move('o1', -1, { reason: 'HOLD_RESERVE' }),
      move('o1', -1, { reason: 'ORDER_KITCHEN' }),
      move('o1', 5, { reason: 'SHORTAGE_COVER' }),
      move('o1', 1, { reason: 'REFUND_RESTOCK' }),
      move('o2', -2),
    ] as never);

    const res = await loadOrderLedger({}, 'audit');
    expect(res.orders.find((o) => o.id === 'o1')?.verdict).toBe('ok');
  });

  it('par identifiant : aucune requête de sélection', async () => {
    queryRaw.mockReset();
    orderFindMany.mockResolvedValue([order('o1', 1)] as never);
    moveFindMany.mockResolvedValue([move('o1', -2)] as never);

    const res = await loadOrderLedger({ orderIds: ['o1'] }, 'audit');
    expect(queryRaw).not.toHaveBeenCalled();
    expect(res.orders).toHaveLength(1);
  });

  it('filtre produit : seules les lignes du produit sont affichées, le verdict reste global', async () => {
    orderFindMany.mockResolvedValue([
      order('o1', 1, {
        items: [
          {
            productId: 'p1',
            productName: 'Crêpe',
            quantity: 2,
            supplements: [],
          },
          {
            productId: 'p2',
            productName: 'Beignet',
            quantity: 1,
            supplements: [],
          },
        ],
      }),
    ] as never);
    // Besoin global : Crêpe 2 + Beignet 1 ; besoin du produit seul : Crêpe 2.
    needs.mockReset();
    needs
      .mockResolvedValueOnce({
        products: new Map([
          ['p1', { name: 'Crêpe', needed: 2 }],
          ['p2', { name: 'Beignet', needed: 1 }],
        ]),
        options: new Map(),
        unresolved: new Map(),
      } as never)
      .mockResolvedValueOnce({
        products: new Map([['p1', { name: 'Crêpe', needed: 2 }]]),
        options: new Map(),
        unresolved: new Map(),
      } as never);
    moveFindMany.mockResolvedValue([move('o1', -2)] as never);

    const res = await loadOrderLedger({ productId: 'p1' }, 'product');
    const o = res.orders[0];
    expect(o.lines.map((l) => l.label)).toEqual(['Crêpe']);
    expect(o.productQuantity).toBe(2);
    // Le Beignet n'a pas été décompté : le verdict global le voit.
    expect(o.verdict).toBe('missing');
  });
});
