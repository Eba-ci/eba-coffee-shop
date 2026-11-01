import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/stock-history/record', async () =>
  (await import('@/lib/stock-history/test-mocks')).recordMock()
);
vi.mock('@/lib/stock-history/lifecycle', async () =>
  (await import('@/lib/stock-history/test-mocks')).lifecycleMock()
);
vi.mock('@/lib/stock-history/lock', async () => ({
  lockStock: vi.fn(async () => 0),
}));

import type { Prisma } from '@/generated/prisma/client';
import { logCreated } from '@/lib/stock-history/lifecycle';
import { logStockSet } from '@/lib/stock-history/record';
import { syncSupplementGroups } from './supplement-groups-sync';

const group = (stock: number) => ({
  name: 'Goût',
  type: 'single' as const,
  kind: 'flavor' as const,
  required: false,
  available: true,
  minSelect: null,
  maxSelect: null,
  options: [
    { name: 'Caramel', price: 0, available: true, stockQuantity: stock },
  ],
});

function makeTx(productName: string | undefined) {
  return {
    product: {
      findUnique: vi
        .fn()
        .mockResolvedValue(productName ? { name: productName } : null),
    },
    supplementGroup: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'g1',
          name: 'Goût',
          options: [{ id: 'o1', name: 'Caramel', stockQuantity: 0 }],
        },
      ]),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    supplementOption: {
      update: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'o2', stockQuantity: 3 }),
      deleteMany: vi.fn(),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('syncSupplementGroups — libellé du journal', () => {
  it('porte le nom du produit : « Produit · Groupe · Option »', async () => {
    const tx = makeTx('Crêpe');
    await syncSupplementGroups(tx, { productId: 'p1' }, [group(2)]);
    expect(logStockSet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        resourceId: 'o1',
        reason: 'FORM_EDIT',
        label: 'Crêpe · Goût · Caramel',
      })
    );
  });

  it('groupe global : pas de produit, « Groupe · Option »', async () => {
    const tx = makeTx(undefined);
    await syncSupplementGroups(tx, { isGlobal: true }, [group(2)]);
    expect(tx.product.findUnique).not.toHaveBeenCalled();
    expect(logStockSet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ label: 'Goût · Caramel' })
    );
  });

  it('option créée : libellé complet aussi', async () => {
    const tx = makeTx('Crêpe');
    const g = group(3);
    g.options = [
      { name: 'Caramel', price: 0, available: true, stockQuantity: 0 },
      { name: 'Praliné', price: 0, available: true, stockQuantity: 3 },
    ];
    await syncSupplementGroups(tx, { productId: 'p1' }, [g]);
    expect(logCreated).toHaveBeenCalledWith(tx, 'OPTION', [
      expect.objectContaining({ id: 'o2', label: 'Crêpe · Goût · Praliné' }),
    ]);
  });
});
