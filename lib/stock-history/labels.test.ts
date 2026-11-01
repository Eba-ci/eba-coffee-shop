import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: { supplementOption: { findMany: vi.fn() } },
}));

import prisma from '@/lib/prisma';
import { currentOptionLabels } from './labels';

const findMany = vi.mocked(prisma.supplementOption.findMany);

describe('currentOptionLabels', () => {
  beforeEach(() => vi.resetAllMocks());

  it('« Produit · Groupe · Option », ou « Groupe · Option » pour un groupe global', async () => {
    findMany.mockResolvedValue([
      {
        id: 'o1',
        name: 'Caramel',
        group: { name: 'Goût', product: { name: 'Crêpe' } },
      },
      {
        id: 'o2',
        name: 'Chantilly',
        group: { name: 'Extras', product: null },
      },
    ] as never);
    const labels = await currentOptionLabels(['o1', 'o2', 'o1']);
    expect(labels.get('o1')).toBe('Crêpe · Goût · Caramel');
    expect(labels.get('o2')).toBe('Extras · Chantilly');
    expect(findMany.mock.calls[0][0]?.where).toEqual({
      id: { in: ['o1', 'o2'] },
    });
  });

  it('aucune requête sans identifiant ; option supprimée absente du résultat', async () => {
    expect((await currentOptionLabels([])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
    findMany.mockResolvedValue([] as never);
    expect((await currentOptionLabels(['gone'])).has('gone')).toBe(false);
  });
});
