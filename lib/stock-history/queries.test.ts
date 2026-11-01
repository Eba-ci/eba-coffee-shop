import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    stockMovement: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    user: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import prisma from '@/lib/prisma';
import { getStockMovementSummary, listStockMovements } from './queries';

const findMany = vi.mocked(prisma.stockMovement.findMany);
const count = vi.mocked(prisma.stockMovement.count);
const groupBy = vi.mocked(prisma.stockMovement.groupBy);
const queryRaw = vi.mocked(prisma.$queryRaw);

const row = {
  id: 'm1',
  createdAt: new Date('2026-10-27T10:00:00Z'),
  kind: 'PRODUCT',
  resourceId: 'p1',
  label: 'Beignet',
  reason: 'ORDER_KITCHEN',
  source: 'STAFF',
  delta: -2,
  before: 9,
  after: 7,
  orderId: 'o1',
  refundId: null,
  actorId: 'u1',
  note: null,
};

describe('listStockMovements', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findMany.mockResolvedValue([row] as never);
    count.mockResolvedValue(65);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', name: 'Awa', email: 'a@x.ci' },
    ] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'o1', dailyNumber: 14 },
    ] as never);
  });

  it('pagine du plus récent au plus ancien et joint personne + n° de commande', async () => {
    const res = await listStockMovements({ page: 2, pageSize: 30 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 30,
        take: 30,
      })
    );
    expect(res.totalPages).toBe(3);
    expect(res.movements[0]).toMatchObject({
      actorName: 'Awa',
      orderNumber: 14,
    });
  });

  it('borne la taille de page', async () => {
    await listStockMovements({ pageSize: 5000 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it('traduit les filtres en clause where', async () => {
    await listStockMovements({
      from: new Date('2026-10-26T00:00:00Z'),
      toExclusive: new Date('2026-10-28T00:00:00Z'),
      reasons: ['ORDER_KITCHEN'],
      resourceId: 'p1',
      orderId: 'o1',
    });
    expect(findMany.mock.calls[0][0]?.where).toEqual({
      createdAt: {
        gte: new Date('2026-10-26T00:00:00Z'),
        lt: new Date('2026-10-28T00:00:00Z'),
      },
      resourceId: 'p1',
      reason: { in: ['ORDER_KITCHEN'] },
      orderId: 'o1',
    });
  });

  it('recherche par nom : filtre sur les ressources trouvées', async () => {
    queryRaw.mockResolvedValue([{ id: 'p1' }, { id: 'o9' }] as never);
    await listStockMovements({ search: 'beignet' });
    expect(findMany.mock.calls[0][0]?.where).toMatchObject({
      resourceId: { in: ['p1', 'o9'] },
    });
  });

  it('recherche sans résultat : liste vide, aucune requête sur le journal', async () => {
    queryRaw.mockResolvedValue([] as never);
    const res = await listStockMovements({ search: 'zzzz' });
    expect(res).toMatchObject({ movements: [], total: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('getStockMovementSummary', () => {
  it('somme sorties et entrées par motif, plus gros volume d’abord', async () => {
    vi.resetAllMocks();
    groupBy
      .mockResolvedValueOnce([
        { reason: 'ORDER_KITCHEN', _count: { _all: 4 } },
        { reason: 'MANUAL_RESTOCK', _count: { _all: 1 } },
      ] as never)
      .mockResolvedValueOnce([
        { reason: 'MANUAL_RESTOCK', _sum: { delta: 12 } },
      ] as never)
      .mockResolvedValueOnce([
        { reason: 'ORDER_KITCHEN', _sum: { delta: -9 } },
      ] as never);
    const res = await getStockMovementSummary({});
    expect(res).toEqual([
      { reason: 'MANUAL_RESTOCK', movements: 1, unitsIn: 12, unitsOut: 0 },
      { reason: 'ORDER_KITCHEN', movements: 4, unitsIn: 0, unitsOut: 9 },
    ]);
  });
});
