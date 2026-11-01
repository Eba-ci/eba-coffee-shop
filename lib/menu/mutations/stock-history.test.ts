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
vi.mock('@/lib/restock-alerts', () => ({ triggerRestockAlerts: vi.fn() }));
vi.mock('@/lib/orders/stock-holds', () => ({
  reserveForScheduledOrdersSafe: vi.fn(),
}));

import { lockStock } from '@/lib/stock-history/lock';
import { logStockChange, logStockSet } from '@/lib/stock-history/record';
import {
  restockOption,
  restockProduct,
  setOptionStock,
  setProductStock,
} from '@/lib/menu-mutations';
import { mockProdUpdate, mockSupOptionUpdate } from './test-utils';

const lock = vi.mocked(lockStock);

describe('journal du stock — réglages manuels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lock.mockResolvedValue(5);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
    mockSupOptionUpdate.mockResolvedValue({ id: 'o1' } as never);
  });

  it('setProductStock journalise l’ancienne et la nouvelle valeur', async () => {
    await setProductStock('p1', 12, { actorId: 'u1' });
    expect(logStockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'PRODUCT',
        resourceId: 'p1',
        reason: 'MANUAL_SET',
        before: 5,
        after: 12,
        ctx: { actorId: 'u1' },
      })
    );
  });

  it('setOptionStock vers illimité (null) est journalisé', async () => {
    await setOptionStock('o1', null);
    expect(logStockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'OPTION', before: 5, after: null })
    );
  });

  it('ligne introuvable : erreur, rien n’est écrit ni journalisé', async () => {
    lock.mockResolvedValue(undefined);
    await expect(setProductStock('x', 3)).rejects.toThrow(
      'Produit introuvable'
    );
    await expect(restockOption('x', 3)).rejects.toThrow('Option introuvable');
    expect(mockProdUpdate).not.toHaveBeenCalled();
    expect(logStockSet).not.toHaveBeenCalled();
  });

  it('restockProduct journalise le delta signé', async () => {
    await restockProduct('p1', 6);
    expect(logStockChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'PRODUCT',
        reason: 'MANUAL_RESTOCK',
        delta: 6,
      })
    );
  });

  it('un retrait qui ferait passer le stock sous zéro est refusé', async () => {
    await expect(restockProduct('p1', -6)).rejects.toThrow(
      'Stock insuffisant : 5 en stock, impossible de retirer 6'
    );
    expect(mockProdUpdate).not.toHaveBeenCalled();
    expect(logStockChange).not.toHaveBeenCalled();
  });

  it('retirer exactement le stock restant est permis', async () => {
    await restockProduct('p1', -5);
    expect(mockProdUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: { increment: -5 } },
    });
  });

  it('stock illimité : réappro impossible', async () => {
    lock.mockResolvedValue(null);
    await expect(restockProduct('p1', 2)).rejects.toThrow(
      'Produit à stock illimité'
    );
  });
});
