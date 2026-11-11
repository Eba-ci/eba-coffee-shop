import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentSession: vi.fn(),
  ROLE_GROUPS: { FINANCE: ['ADMIN', 'MANAGER', 'COMPTABLE'] },
}));
vi.mock('@/lib/expenses', () => ({ listExpenses: vi.fn() }));

import { getCurrentSession } from '@/lib/auth-helpers';
import { listExpenses } from '@/lib/expenses';
import { GET } from './route';

const req = (search = '') =>
  new NextRequest(`http://localhost/api/export/expenses${search}`);

function session(role: string) {
  vi.mocked(getCurrentSession).mockResolvedValue({ user: { role } } as never);
}

describe('export CSV des dépenses — détail salaires réservé à l’ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listExpenses).mockResolvedValue({
      expenses: [],
      total: 0,
      count: 0,
    } as never);
  });

  it('refuse (403) un rôle hors finance', async () => {
    session('CASHIER');
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(listExpenses).not.toHaveBeenCalled();
  });

  it.each(['MANAGER', 'COMPTABLE'])(
    'passe includeSalary=false pour %s',
    async (role) => {
      session(role);
      await GET(req('?from=2026-06-01&to=2026-06-30'));
      expect(listExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ includeSalary: false })
      );
    }
  );

  it('passe includeSalary=true pour l’ADMIN', async () => {
    session('ADMIN');
    await GET(req('?from=2026-06-01&to=2026-06-30'));
    expect(listExpenses).toHaveBeenCalledWith(
      expect.objectContaining({ includeSalary: true })
    );
  });
});
