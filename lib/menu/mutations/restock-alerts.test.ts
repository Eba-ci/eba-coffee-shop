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

import { triggerRestockAlerts } from '@/lib/restock-alerts';
import {
  setProductStock,
  resumeProduct,
  updateProduct,
} from '@/lib/menu-mutations';
import { mockProdUpdate, mockProdFindUnique } from './test-utils';

// ─── Alertes « de retour » ────────────────────────────────────────────────────

describe('déclenchement des alertes « de retour »', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProdFindUnique.mockResolvedValue({ id: 'p1' } as never);
    mockProdUpdate.mockResolvedValue({ id: 'p1' } as never);
  });

  it('se déclenche quand le stock est redéfini ou la pause levée', async () => {
    await setProductStock('p1', 12);
    await resumeProduct('p1');
    expect(triggerRestockAlerts).toHaveBeenCalledTimes(2);
  });

  it('se déclenche sur updateProduct seulement si stock/pause/goûts changent', async () => {
    await updateProduct('p1', { name: 'Nouveau nom' });
    expect(triggerRestockAlerts).not.toHaveBeenCalled();

    await updateProduct('p1', { stockQuantity: 5 });
    expect(triggerRestockAlerts).toHaveBeenCalledTimes(1);
  });
});
