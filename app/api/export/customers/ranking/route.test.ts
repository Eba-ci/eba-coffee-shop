import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentSession: vi.fn(),
  ROLE_GROUPS: { MANAGER_PLUS: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'] },
}));
vi.mock('@/lib/customers/ranking-query', () => ({
  getCustomerRanking: vi.fn(),
}));

import { getCurrentSession } from '@/lib/auth-helpers';
import { getCustomerRanking } from '@/lib/customers/ranking-query';
import { GET } from './route';

const session = (role: string) =>
  vi.mocked(getCurrentSession).mockResolvedValue({ user: { role } } as never);

describe('export de la liste classée des clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerRanking).mockResolvedValue([
      {
        name: 'Awa',
        phone: '+2250788123456',
        total: 1000,
        orders: 1,
        days: 1,
        firstOrderAt: null,
        lastOrderAt: null,
      },
    ]);
  });

  it.each(['ANALYSTE', 'CASHIER', 'COMPTABLE'])(
    'refuse (403) %s sans lire la base',
    async (role) => {
      session(role);
      expect((await GET()).status).toBe(403);
      expect(getCustomerRanking).not.toHaveBeenCalled();
    }
  );

  it('refuse (403) sans session', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
  });

  it('renvoie le CSV pour un manager', async () => {
    session('MANAGER');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(
      /clients-classes_\d{4}-\d{2}-\d{2}\.csv/
    );
    expect(await res.text()).toContain('Awa');
  });
});
