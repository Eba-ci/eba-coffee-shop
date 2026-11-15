// lib/mcp/actor-context.ts
//
// Utilisateur AUTHENTIFIÉ de l'appel MCP en cours. Posé uniquement par
// `withRoleGuard` après validation du jeton OAuth et du rôle ; la clé statique
// n'en pose aucun. Les écritures de paie le lisent à la place de la session
// navigateur (`requireSalaryAdmin`) : un appel MCP n'a pas de cookie.

import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserRole } from '@/generated/prisma/client';

export type McpActor = { userId: string; role: UserRole };

const storage = new AsyncLocalStorage<McpActor>();

export function runWithMcpActor<T>(actor: McpActor, fn: () => T): T {
  return storage.run(actor, fn);
}

export function mcpActor(): McpActor | undefined {
  return storage.getStore();
}
