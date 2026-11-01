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

import prisma from '@/lib/prisma';
import { updateProduct } from '@/lib/menu-mutations';
import {
  mockProdUpdate,
  mockProdFindUnique,
  mockSupGroupFindMany,
  mockSupGroupCreate,
  mockSupOptionCreate,
} from './test-utils';

describe('updateProduct', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSupGroupFindMany.mockResolvedValue([] as never);
    mockSupGroupCreate.mockResolvedValue({ options: [] } as never);
    mockSupOptionCreate.mockResolvedValue({
      id: 'o-new',
      stockQuantity: null,
    } as never);
  });

  it('met à jour les champs scalaires', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
    await updateProduct('p1', {
      name: 'Renommé',
      description: 'Nouveau',
      price: 4000,
      imageUrl: null,
      supplementGroups: [],
    });

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('crée un nouveau groupe de suppléments absent en base (upsert par nom)', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
    mockSupGroupFindMany.mockResolvedValue([] as never);

    await updateProduct('p1', {
      supplementGroups: [
        {
          name: 'Goûts',
          type: 'quantity',
          required: true,
          available: true,
          minSelect: 3,
          maxSelect: 3,
          options: [
            { name: 'Vanille', price: 0, available: true },
            { name: 'Chocolat', price: 0, available: true },
          ],
        },
      ],
    });

    expect(mockSupGroupCreate).toHaveBeenCalledWith({
      include: { options: true },
      data: expect.objectContaining({
        name: 'Goûts',
        type: 'quantity',
        minSelect: 3,
        maxSelect: 3,
        productId: 'p1',
      }),
    });
  });

  it("rejette si le produit n'existe pas", async () => {
    mockProdFindUnique.mockResolvedValue(null);
    await expect(
      updateProduct('x', {
        name: 'X',
        description: 'd',
        price: 100,
        imageUrl: null,
        supplementGroups: [],
      })
    ).rejects.toThrow('Produit introuvable');
  });

  it('partiel : ne modifie que le prix sans toucher aux suppléments', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);

    await updateProduct('p1', { price: 5000 });

    // Pas de suppléments fournis → pas de transaction (suppléments préservés).
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockProdUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { price: 5000 },
    });
  });

  it('partiel : accepte un chemin d’upload local comme imageUrl', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);

    await updateProduct('p1', { imageUrl: '/uploads/products/x.jpg' });

    expect(mockProdUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { imageUrl: '/uploads/products/x.jpg' },
    });
  });

  it('déplace le produit vers une autre catégorie via categoryId', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);

    await updateProduct('p1', { categoryId: 'cat2' });

    expect(mockProdUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { categoryId: 'cat2' },
    });
  });

  it('assigne un planning récurrent via scheduleId', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);

    await updateProduct('p1', { scheduleId: 'sched1' });

    expect(mockProdUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { scheduleId: 'sched1' },
    });
  });

  it('scheduleId: null efface volontairement le planning assigné', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);

    await updateProduct('p1', { scheduleId: null });

    expect(mockProdUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { scheduleId: null },
    });
  });
});
