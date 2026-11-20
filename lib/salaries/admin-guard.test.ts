// Garde des écritures de paie : l'acteur MCP doit être ADMIN ; sans acteur MCP,
// c'est la session navigateur qui décide.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from '@/lib/auth-helpers';
import { runWithMcpActor } from '@/lib/mcp/actor-context';
import { requireSalaryAdmin } from './admin-guard';

beforeEach(() => vi.resetAllMocks());

describe('requireSalaryAdmin', () => {
  it('accepte un acteur MCP ADMIN sans lire de session', async () => {
    const res = await runWithMcpActor({ userId: 'u1', role: 'ADMIN' }, () =>
      requireSalaryAdmin()
    );
    expect(res.user.id).toBe('u1');
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it.each(['COMPTABLE', 'MANAGER', 'ANALYSTE'] as const)(
    'refuse un acteur MCP %s',
    async (role) => {
      await expect(
        runWithMcpActor({ userId: 'u1', role }, () => requireSalaryAdmin())
      ).rejects.toThrow('Non autorisé');
    }
  );

  it('sans acteur MCP, délègue à la session navigateur', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('Non autorisé'));
    await expect(requireSalaryAdmin()).rejects.toThrow('Non autorisé');
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });
});
