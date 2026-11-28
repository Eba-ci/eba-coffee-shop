import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentSession: vi.fn(),
  ROLE_GROUPS: { MANAGER_PLUS: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'] },
}));
vi.mock('@/lib/prisma', () => ({
  default: { customer: { findMany: vi.fn() } },
}));

import prisma from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth-helpers';
import { GET } from './route';

const req = (search = '') =>
  new NextRequest(`http://localhost/api/export/customers${search}`);

function session(role: string) {
  vi.mocked(getCurrentSession).mockResolvedValue({ user: { role } } as never);
}

describe('export des clients vers Google Contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      { name: 'Awa Koné', phone: '+2250788123456', anonymizedAt: null },
      { name: 'Sans numéro valide', phone: '123', anonymizedAt: null },
    ] as never);
  });

  it.each(['ANALYSTE', 'CASHIER', 'COMPTABLE'])(
    'refuse (403) le rôle %s sans lire la base',
    async (role) => {
      session(role);
      const res = await GET(req());
      expect(res.status).toBe(403);
      expect(prisma.customer.findMany).not.toHaveBeenCalled();
    }
  );

  it('refuse (403) sans session', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    expect((await GET(req())).status).toBe(403);
  });

  it('renvoie le CSV Google par défaut et compte les clients écartés', async () => {
    session('MANAGER');
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('X-Customers-Skipped')).toBe('1');
    const body = await res.text();
    expect(body).toContain('Awa Koné,,Mobile,+2250788123456,Clients EBA');
    expect(body).not.toContain('Sans numéro valide');
  });

  it('renvoie un .vcf avec ?format=vcf', async () => {
    session('ADMIN');
    const res = await GET(req('?format=vcf'));
    expect(res.headers.get('Content-Type')).toContain('text/vcard');
    expect(await res.text()).toContain('BEGIN:VCARD');
  });
});
