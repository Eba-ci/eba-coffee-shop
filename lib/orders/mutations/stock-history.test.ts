import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stock-history/record', async () =>
  (await import('@/lib/stock-history/test-mocks')).recordMock()
);

import type { Prisma } from '@/generated/prisma/client';
import type { CartItem } from '@/lib/cart-store';
import { logStockAnomaly, logStockChange } from '@/lib/stock-history/record';
import { decrementStockForOrderItems } from './stock-needs';
import { resyncStockForItemChange } from './stock-resync';

function item(over: Partial<CartItem> = {}): CartItem {
  return {
    cartId: 'c1',
    productId: 'p1',
    productName: 'Crêpe',
    quantity: 2,
    supplements: [],
    ...over,
  } as CartItem;
}

function makeTx(optionId: string | null = 'o1') {
  return {
    product: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    supplementOption: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(optionId ? { id: optionId } : null),
    },
  } as unknown as Prisma.TransactionClient;
}

const choco = {
  groupName: 'Goûts',
  optionName: 'Chocolat',
  quantity: 1,
  price: 0,
};

describe('journal du stock — commandes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('le lancement journalise produit ET goûts avec la commande', async () => {
    const tx = makeTx();
    await decrementStockForOrderItems(
      tx,
      [item({ supplements: [choco] as never })],
      { orderId: 'ord1', actorId: 'u1' }
    );
    expect(logStockChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        kind: 'PRODUCT',
        resourceId: 'p1',
        reason: 'ORDER_KITCHEN',
        delta: -2,
        ctx: { orderId: 'ord1', actorId: 'u1' },
      })
    );
    expect(logStockChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        kind: 'OPTION',
        resourceId: 'o1',
        reason: 'ORDER_KITCHEN',
        delta: -2,
      })
    );
  });

  it('une pénurie ne journalise rien', async () => {
    const tx = makeTx();
    vi.mocked(tx.product.updateMany).mockResolvedValue({ count: 0 });
    await expect(decrementStockForOrderItems(tx, [item()])).rejects.toThrow(
      'Stock insuffisant'
    );
    expect(logStockChange).not.toHaveBeenCalled();
  });

  it('ajout d’articles à une commande lancée : ORDER_EDIT_ADD', async () => {
    const tx = makeTx();
    await resyncStockForItemChange(
      tx,
      [item({ quantity: 1 })],
      [item({ quantity: 3 })],
      true,
      false,
      { orderId: 'ord1' }
    );
    expect(logStockChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        reason: 'ORDER_EDIT_ADD',
        delta: -2,
        ctx: { orderId: 'ord1' },
      })
    );
  });

  it('retrait : motif imposé par l’appelant (expiration)', async () => {
    const tx = makeTx();
    await resyncStockForItemChange(tx, [item()], [], true, false, {
      orderId: 'ord1',
      source: 'SYSTEM',
      removeReason: 'EXPIRY_RELEASE',
    });
    expect(logStockChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        reason: 'EXPIRY_RELEASE',
        delta: 2,
        ctx: { orderId: 'ord1', source: 'SYSTEM' },
      })
    );
  });

  it('retrait sans restitution : aucun mouvement', async () => {
    const tx = makeTx();
    await resyncStockForItemChange(tx, [item()], [], false);
    expect(logStockChange).not.toHaveBeenCalled();
  });

  it('retrait d’un goût introuvable : une anomalie plutôt que le silence', async () => {
    const tx = makeTx(null);
    await resyncStockForItemChange(
      tx,
      [item({ supplements: [choco] as never })],
      [item({ supplements: [] })],
      true
    );
    expect(logStockAnomaly).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        kind: 'OPTION',
        label: 'Crêpe · Goûts · Chocolat',
        note: expect.stringContaining('Stock non rendu'),
      })
    );
  });
});
