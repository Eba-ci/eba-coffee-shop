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

import { updateProduct } from '@/lib/menu-mutations';
import {
  mockProdUpdate,
  mockProdFindUnique,
  mockSupGroupFindMany,
  mockSupGroupUpdate,
  mockSupGroupCreate,
  mockSupOptionUpdate,
  mockSupOptionCreate,
  mockSupOptionDeleteMany,
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

  // Régression : deux options homonymes en base ; l'appariement doit consommer une file par nom.
  it('supprime le doublon quand deux options existantes partagent un nom et qu’une seule est soumise', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
    mockSupGroupFindMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'Choisissez vos goûts',
        options: [
          {
            id: 'opt-disabled',
            name: 'Cacahuète vanille',
            price: 0,
            available: false,
            stockQuantity: null,
          },
          {
            id: 'opt-active',
            name: 'Cacahuète vanille',
            price: 0,
            available: true,
            stockQuantity: 12,
          },
          {
            id: 'opt-bissap',
            name: 'Bissap',
            price: 0,
            available: true,
            stockQuantity: 3,
          },
        ],
      },
    ] as never);

    await updateProduct('p1', {
      supplementGroups: [
        {
          name: 'Choisissez vos goûts',
          type: 'quantity',
          required: true,
          available: true,
          minSelect: 3,
          maxSelect: 3,
          options: [
            {
              name: 'Cacahuète vanille',
              price: 0,
              available: true,
              stockQuantity: 12,
            },
            { name: 'Bissap', price: 0, available: true, stockQuantity: 3 },
          ],
        },
      ],
    });

    // Une seule des deux lignes "Cacahuète vanille" est mise à jour (l'ordre
    // dans lequel Prisma les a retournées, peu importe laquelle exactement),
    // l'autre est supprimée — jamais les deux mises à jour, jamais aucune
    // supprimée.
    expect(mockSupOptionUpdate).toHaveBeenCalledWith({
      where: { id: 'opt-disabled' },
      data: expect.objectContaining({
        name: 'Cacahuète vanille',
        available: true,
      }),
    });
    expect(mockSupOptionUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'opt-active' } })
    );
    expect(mockSupOptionDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['opt-active'] } },
    });
    expect(mockSupOptionCreate).not.toHaveBeenCalled();
  });

  // Régression : la fiche produit charge le stock une fois à l'ouverture de
  // la page, puis des ventes peuvent le décrémenter en cuisine AVANT que le
  // staff n'enregistre une modif sans rapport (prix, nom...) sur ce même
  // écran. Omettre `stockQuantity` (option non touchée dans l'éditeur, cf.
  // `fromUiGroup`, supplements-editor.tsx) ne doit PAS réécrire le stock
  // d'une option EXISTANTE avec une valeur figée — sous peine d'effacer ce
  // décrément réel et de causer une survente immédiate. Une option NOUVELLE
  // n'a rien à perdre : elle garde son défaut `?? null`.
  it('ne réécrit pas le stock d’une option existante quand il est omis (non touché)', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
    mockSupGroupFindMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'Goûts',
        options: [
          {
            id: 'opt-vanille',
            name: 'Vanille',
            price: 0,
            available: true,
            stockQuantity: 5,
          },
        ],
      },
    ] as never);

    await updateProduct('p1', {
      supplementGroups: [
        {
          name: 'Goûts',
          type: 'single',
          required: true,
          available: true,
          minSelect: null,
          maxSelect: null,
          options: [
            // `stockQuantity` omis : l'admin n'a touché que le nom/prix.
            { name: 'Vanille', price: 150, available: true },
          ],
        },
      ],
    });

    expect(mockSupOptionUpdate).toHaveBeenCalledWith({
      where: { id: 'opt-vanille' },
      data: expect.objectContaining({ name: 'Vanille', price: 150 }),
    });
    const call = mockSupOptionUpdate.mock.calls.find(
      (c) => (c[0] as { where: { id: string } }).where.id === 'opt-vanille'
    );
    expect(call?.[0]).not.toHaveProperty('data.stockQuantity');
  });

  it('réécrit le stock d’une option existante quand il est explicitement fourni', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
    mockSupGroupFindMany.mockResolvedValue([
      {
        id: 'g1',
        name: 'Goûts',
        options: [
          {
            id: 'opt-vanille',
            name: 'Vanille',
            price: 0,
            available: true,
            stockQuantity: 5,
          },
        ],
      },
    ] as never);

    await updateProduct('p1', {
      supplementGroups: [
        {
          name: 'Goûts',
          type: 'single',
          required: true,
          available: true,
          minSelect: null,
          maxSelect: null,
          options: [
            { name: 'Vanille', price: 0, available: true, stockQuantity: 2 },
          ],
        },
      ],
    });

    expect(mockSupOptionUpdate).toHaveBeenCalledWith({
      where: { id: 'opt-vanille' },
      data: expect.objectContaining({ stockQuantity: 2 }),
    });
  });

  // Un payload partiel (ex. client MCP) qui ignore `kind` ne doit pas remettre
  // un groupe de goûts à « supplément ».
  it('laisse `kind` intact quand le payload ne le fournit pas', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
    mockSupGroupFindMany.mockResolvedValue([
      { id: 'g1', name: 'Goûts', kind: 'flavor', options: [] },
    ] as never);

    await updateProduct('p1', {
      supplementGroups: [
        {
          name: 'Goûts',
          type: 'single',
          required: true,
          available: true,
          minSelect: null,
          maxSelect: null,
          options: [{ name: 'Vanille', price: 0, available: true }],
        },
      ],
    });

    const data = mockSupGroupUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('kind');
  });

  it('écrit `kind` quand il est fourni, et crée par défaut un supplément', async () => {
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
    mockSupGroupFindMany.mockResolvedValue([
      { id: 'g1', name: 'Goûts', kind: 'extra', options: [] },
    ] as never);

    const base = {
      type: 'single' as const,
      required: false,
      available: true,
      minSelect: null,
      maxSelect: null,
      options: [{ name: 'Vanille', price: 0, available: true }],
    };
    await updateProduct('p1', {
      supplementGroups: [
        { ...base, name: 'Goûts', kind: 'flavor' },
        { ...base, name: 'Sauces' },
      ],
    });

    expect(mockSupGroupUpdate.mock.calls[0][0].data).toMatchObject({
      kind: 'flavor',
    });
    expect(mockSupGroupCreate.mock.calls[0][0].data).toMatchObject({
      kind: 'extra',
    });
  });
});
