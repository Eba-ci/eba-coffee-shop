import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/stock-history/queries', () => ({
  listStockMovements: vi.fn().mockResolvedValue({
    movements: [
      {
        id: 'm1',
        createdAt: new Date('2026-10-27T10:00:00.000Z'),
        kind: 'PRODUCT',
        resourceId: 'p1',
        label: 'Beignet',
        reason: 'ORDER_KITCHEN',
        source: 'STAFF',
        delta: -2,
        before: 9,
        after: 7,
        orderId: 'o1',
        orderNumber: 14,
        orderReference: 'EBA-20261101-0014',
        refundId: null,
        actorId: 'u1',
        actorName: 'Awa',
        note: null,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 30,
    totalPages: 1,
  }),
  getStockMovementSummary: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/stock-history/order-audit-query', () => ({
  loadOrderLedger: vi.fn().mockResolvedValue({
    journalStart: new Date('2026-11-01T10:00:00.000Z'),
    examined: 2,
    defects: 1,
    warnings: 0,
    total: 2,
    orders: [
      {
        id: 'o6',
        dailyNumber: 6,
        reference: 'EBA-20261101-0006',
        createdAt: new Date('2026-11-01T11:00:00.000Z'),
        status: 'COMPLETED',
        isPaid: true,
        stockReservedAt: new Date('2026-11-01T11:01:00.000Z'),
        verdict: 'missing',
        defect: true,
        explanation: { label: 'Lancée mais non (ou partiellement) décomptée' },
        lines: [
          {
            kind: 'PRODUCT',
            resourceId: 'p1',
            label: 'Crêpe',
            needed: 2,
            consumed: 0,
            status: 'missing',
          },
        ],
      },
    ],
  }),
}));
vi.mock('@/lib/stock-history/audit', () => ({
  runStockAudit: vi.fn().mockResolvedValue({ drifts: [] }),
}));

import {
  getStockMovementSummary,
  listStockMovements,
} from '@/lib/stock-history/queries';
import { loadOrderLedger } from '@/lib/stock-history/order-audit-query';
import { READ_ONLY_TOOL_NAMES, toolsByName } from './registry';

const tool = (name: string) => toolsByName.get(name)!;

describe('outils MCP — historique du stock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('trois outils, tous en lecture seule (ouverts à l’analyste)', () => {
    for (const n of [
      'get_stock_order_audit',
      'list_stock_movements',
      'get_stock_history_summary',
      'get_stock_audit',
    ]) {
      expect(READ_ONLY_TOOL_NAMES.has(n)).toBe(true);
      expect(tool(n).toolset).toBe('menu');
    }
  });

  it('la fin de plage est inclusive : borne exclusive au lendemain', async () => {
    await tool('list_stock_movements').handler({
      from: '2026-10-26',
      to: '2026-10-27',
      resourceId: 'p1',
      page: 2,
    });
    expect(listStockMovements).toHaveBeenCalledWith(
      expect.objectContaining({
        from: new Date('2026-10-26T00:00:00.000Z'),
        toExclusive: new Date('2026-10-28T00:00:00.000Z'),
        resourceId: 'p1',
        page: 2,
      })
    );
  });

  it('un seul jour fourni couvre ce jour', async () => {
    await tool('get_stock_history_summary').handler({ from: '2026-10-27' });
    expect(getStockMovementSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        from: new Date('2026-10-27T00:00:00.000Z'),
        toExclusive: new Date('2026-10-28T00:00:00.000Z'),
      })
    );
  });

  it('la liste est aplatie pour le modèle (date ISO, nom de la personne)', async () => {
    const res = (await tool('list_stock_movements').handler({})) as {
      movements: Record<string, unknown>[];
    };
    expect(res.movements[0]).toMatchObject({
      at: '2026-10-27T10:00:00.000Z',
      actor: 'Awa',
      orderNumber: 14,
      orderReference: 'EBA-20261101-0014',
      delta: -2,
    });
    expect(res.movements[0]).not.toHaveProperty('actorId');
  });

  it('audit par commande : défauts seulement par défaut, résultat aplati', async () => {
    const res = (await tool('get_stock_order_audit').handler({
      productId: 'p1',
      from: '2026-11-01',
    })) as { defects: number; orders: Record<string, unknown>[] };
    expect(loadOrderLedger).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p1', onlyIssues: true }),
      'audit'
    );
    expect(res.defects).toBe(1);
    expect(res.orders[0]).toMatchObject({
      orderNumber: 6,
      orderReference: 'EBA-20261101-0006',
      verdict: 'missing',
      defect: true,
      explanation: 'Lancée mais non (ou partiellement) décomptée',
    });
  });

  it('audit par commande : onlyIssues=false renvoie tout', async () => {
    await tool('get_stock_order_audit').handler({ onlyIssues: false });
    expect(loadOrderLedger).toHaveBeenCalledWith(
      expect.objectContaining({ onlyIssues: false }),
      'audit'
    );
  });

  it('refuse un motif inconnu', () => {
    expect(
      tool('list_stock_movements').inputSchema.safeParse({ reasons: ['X'] })
        .success
    ).toBe(false);
  });
});
