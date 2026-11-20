// lib/salaries/admin-guard.ts
//
// Garde unique des ÉCRITURES de paie : ADMIN seul. Deux origines possibles :
//  - appel MCP : l'acteur authentifié par OAuth (`mcpActor`) doit être ADMIN ;
//  - application : la session navigateur (`requireAdmin`).
// Sans acteur MCP ni session (clé statique, appel anonyme), l'écriture est
// refusée.

import { requireAdmin } from '@/lib/auth-helpers';
import { mcpActor } from '@/lib/mcp/actor-context';

export async function requireSalaryAdmin(): Promise<{
  user: { id: string; role: string };
}> {
  const actor = mcpActor();
  if (actor) {
    if (actor.role !== 'ADMIN') throw new Error('Non autorisé');
    return { user: { id: actor.userId, role: actor.role } };
  }
  return requireAdmin();
}
