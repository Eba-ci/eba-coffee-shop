// lib/mcp/tools/types.ts
//
// Types et domaines partagés par les modules d'outils MCP.

import type { z } from 'zod';

// ─── Domaines fonctionnels (toolsets) ──────────────────────────────────────
//
// Partition les outils en domaines mutuellement exclusifs, utilisée pour le
// filtrage `?toolset=` côté route (cf. `app/api/mcp/route.ts`). Champ
// PUREMENT organisationnel, sans lien avec `scope` (qui gate l'accès par
// rôle) : un outil peut avoir `toolset: 'inventaire'` et `scope: 'finance'`
// en même temps (ex. `list_inventory_items`), ou `toolset: 'stats'` sans
// aucun `scope` (ex. `get_customer_stats`) — ne pas déduire l'un de l'autre.
export const TOOLSET_NAMES = [
  'menu',
  'stats',
  'finance',
  'commandes',
  'crm',
  'contact',
  'inventaire',
  'sondages',
  'tiktok',
] as const;

export type ToolsetName = (typeof TOOLSET_NAMES)[number];

// ─── Type d'un outil ────────────────────────────────────────────────────────

export type McpTool = {
  name: string;
  title: string;
  description: string;
  /** Schéma Zod des arguments. `z.object({})` = aucun argument. */
  inputSchema: z.ZodType;
  /** Outil en lecture seule (annotation MCP `readOnlyHint`). */
  readOnly: boolean;
  /** Domaine fonctionnel (cf. `TOOLSET_NAMES`) — obligatoire, tout nouvel outil doit être classé. */
  toolset: ToolsetName;
  /**
   * Portée d'accès restreinte. `'finance'` = accessible aux rôles finance
   * (ADMIN, MANAGER, COMPTABLE, ANALYSTE en lecture) ; `'admin'` = ADMIN seul
   * (jamais MANAGER, COMPTABLE ni ANALYSTE ; jamais l'assistant IA) ;
   * absent = accessible à ADMIN/MANAGER (cf. `withRoleGuard` dans
   * `app/api/mcp/route.ts`).
   */
  scope?: 'finance' | 'admin';
  /** Exécute l'outil. Reçoit les arguments déjà validés par `inputSchema`. */
  handler: (args: unknown) => Promise<unknown>;
};
