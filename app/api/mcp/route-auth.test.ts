import { describe, it, expect, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { getMcpSession } = await import('./route.test-mocks');
  return {
    auth: {
      options: { baseURL: 'http://localhost', basePath: '/api/auth' },
      api: { getMcpSession },
    },
  };
});

vi.mock('@/lib/prisma', async () => {
  const { userFindUnique } = await import('./route.test-mocks');
  return { default: { user: { findUnique: userFindUnique } } };
});

import { POST } from './route';
import {
  getMcpSession,
  userFindUnique,
  makeRequest,
  authHeader,
  setupMcpRouteTests,
} from './route.test-mocks';

setupMcpRouteTests();

describe('authentification — clé statique', () => {
  it('accepte la clé statique MCP_API_KEY (chemin propriétaire)', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'ping' }, authHeader)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toEqual({});
    // La clé statique court-circuite OAuth : pas d'appel à getMcpSession.
    expect(getMcpSession).not.toHaveBeenCalled();
  });
});

describe('authentification — OAuth', () => {
  it('renvoie 401 sans en-tête Authorization', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'ping' })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer');
  });

  it('renvoie 401 avec un jeton OAuth invalide', async () => {
    getMcpSession.mockResolvedValue(null);
    const res = await POST(
      makeRequest(
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { authorization: 'Bearer mauvais-jeton' }
      )
    );
    expect(res.status).toBe(401);
  });

  it('renvoie 401 même sans MCP_API_KEY configurée (plus de 503)', async () => {
    delete process.env.MCP_API_KEY;
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'ping' })
    );
    expect(res.status).toBe(401);
  });

  it('accepte un jeton OAuth d’un ADMIN', async () => {
    getMcpSession.mockResolvedValue({ userId: 'u1' });
    userFindUnique.mockResolvedValue({ role: 'ADMIN' });
    const res = await POST(
      makeRequest(
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { authorization: 'Bearer jeton-oauth-valide' }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toEqual({});
  });

  it('refuse (403) un jeton OAuth d’un non-ADMIN', async () => {
    getMcpSession.mockResolvedValue({ userId: 'u2' });
    userFindUnique.mockResolvedValue({ role: 'USER' });
    const res = await POST(
      makeRequest(
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { authorization: 'Bearer jeton-oauth-non-admin' }
      )
    );
    expect(res.status).toBe(403);
  });

  it('accepte un jeton OAuth d’un MANAGER (accès total hors paie)', async () => {
    getMcpSession.mockResolvedValue({ userId: 'u3' });
    userFindUnique.mockResolvedValue({ role: 'MANAGER' });
    const res = await POST(
      makeRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { authorization: 'Bearer jeton-oauth-manager' }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const names = (json.result.tools as Array<{ name: string }>).map(
      (t) => t.name
    );
    expect(names).toContain('get_menu');
    expect(names).toContain('list_expenses');
    // Le détail de la paie reste à l'ADMIN : le MANAGER ne voit aucun outil
    // de détail salaires, seulement l'agrégat mensuel (finance).
    expect(names).toContain('get_salary_month_total');
    expect(names).not.toContain('get_salary_month_view');
    expect(names).not.toContain('list_salary_employees');
    expect(names).not.toContain('list_salary_advances');
  });

  it('le MANAGER ne peut PAS appeler un outil de détail salaires', async () => {
    getMcpSession.mockResolvedValue({ userId: 'u3' });
    userFindUnique.mockResolvedValue({ role: 'MANAGER' });
    const res = await POST(
      makeRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'get_salary_month_view',
            arguments: { month: '2026-06' },
          },
        },
        { authorization: 'Bearer jeton-oauth-manager' }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect((json.result as { isError: boolean }).isError).toBe(true);
  });

  it('accepte un jeton OAuth d’un ADMIN et lui montre le détail salaires', async () => {
    getMcpSession.mockResolvedValue({ userId: 'u6' });
    userFindUnique.mockResolvedValue({ role: 'ADMIN' });
    const res = await POST(
      makeRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { authorization: 'Bearer jeton-oauth-admin' }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const names = (json.result.tools as Array<{ name: string }>).map(
      (t) => t.name
    );
    expect(names).toContain('get_salary_month_view');
    expect(names).toContain('list_salary_employees');
  });

  it('accepte un jeton OAuth d’un COMPTABLE mais restreint les outils finance', async () => {
    getMcpSession.mockResolvedValue({ userId: 'u4' });
    userFindUnique.mockResolvedValue({ role: 'COMPTABLE' });
    const res = await POST(
      makeRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { authorization: 'Bearer jeton-oauth-comptable' }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const names = (json.result.tools as Array<{ name: string }>).map(
      (t) => t.name
    );
    expect(names).toContain('list_expenses');
    expect(names).toContain('get_daily_stats');
    expect(names).toContain('get_salary_month_total');
    expect(names).not.toContain('get_menu');
    expect(names).not.toContain('create_product');
    expect(names).not.toContain('get_salary_month_view');
    expect(names).not.toContain('list_salary_employees');
    expect(names).not.toContain('list_salary_advances');
  });

  it('ANALYSTE (lecture seule) ne voit aucun détail salaires', async () => {
    getMcpSession.mockResolvedValue({ userId: 'u7' });
    userFindUnique.mockResolvedValue({ role: 'ANALYSTE' });
    const res = await POST(
      makeRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { authorization: 'Bearer jeton-oauth-analyste' }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const names = (json.result.tools as Array<{ name: string }>).map(
      (t) => t.name
    );
    expect(names).toContain('get_salary_month_total');
    expect(names).not.toContain('get_salary_month_view');
    expect(names).not.toContain('list_salary_employees');
    expect(names).not.toContain('list_salary_advances');
  });

  it('refuse (403) un jeton OAuth d’un CASHIER (hors rôles MCP)', async () => {
    getMcpSession.mockResolvedValue({ userId: 'u5' });
    userFindUnique.mockResolvedValue({ role: 'CASHIER' });
    const res = await POST(
      makeRequest(
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { authorization: 'Bearer jeton-oauth-cashier' }
      )
    );
    expect(res.status).toBe(403);
  });
});
