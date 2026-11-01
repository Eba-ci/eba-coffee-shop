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
vi.mock('@/lib/stock-history/audit', () => ({
  runStockAudit: vi.fn().mockResolvedValue({ drifts: [] }),
}));

import {
  getStockMovementSummary,
  listStockMovements,
} from '@/lib/stock-history/queries';
import { READ_ONLY_TOOL_NAMES, toolsByName } from './registry';

const tool = (name: string) => toolsByName.get(name)!;

describe('outils MCP — historique du stock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('trois outils, tous en lecture seule (ouverts à l’analyste)', () => {
    for (const n of [
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
      delta: -2,
    });
    expect(res.movements[0]).not.toHaveProperty('actorId');
  });

  it('refuse un motif inconnu', () => {
    expect(
      tool('list_stock_movements').inputSchema.safeParse({ reasons: ['X'] })
        .success
    ).toBe(false);
  });
});
