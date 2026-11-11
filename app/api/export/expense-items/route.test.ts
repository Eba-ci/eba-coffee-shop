import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentSession: vi.fn(),
  ROLE_GROUPS: { FINANCE: ['ADMIN', 'MANAGER', 'COMPTABLE'] },
}));
vi.mock('@/lib/prisma', () => ({
  default: { expenseItem: { findMany: vi.fn() } },
}));

import { getCurrentSession } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { GET } from './route';

const req = (search = '') =>
  new NextRequest(`http://localhost/api/export/expense-items${search}`);

function session(role: string) {
  vi.mocked(getCurrentSession).mockResolvedValue({ user: { role } } as never);
}

describe('export CSV des articles de dépense — pas de ligne de salaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.expenseItem.findMany).mockResolvedValue([] as never);
  });

  it('refuse (403) un rôle hors finance', async () => {
    session('ANALYSTE');
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(prisma.expenseItem.findMany).not.toHaveBeenCalled();
  });

  it('exclut toujours les lignes rattachées à un versement de salaire', async () => {
    session('MANAGER');
    await GET(req('?from=2026-06-01&to=2026-06-30'));
    expect(prisma.expenseItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expense: expect.objectContaining({ salaryPaymentId: null }),
        }),
      })
    );
  });
});
