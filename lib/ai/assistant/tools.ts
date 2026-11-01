// lib/ai/assistant/tools.ts
//
// Pont entre l'assistant et le registre d'outils MCP (`lib/mcp/tools`). Aucune
// logique métier ici : on réutilise les mêmes outils, schémas Zod et gardes de
// rôle que le serveur MCP (cf. `withRoleGuard`).

import { z } from 'zod';
import { tools, toolsByName } from '@/lib/mcp/tools';
import { revalidateMenu } from '@/lib/mcp/http/revalidate';
import { runWithStockContext } from '@/lib/stock-history/source-context';
import type { McpTool } from '@/lib/mcp/tools/types';
import type { UserRole } from '@/generated/prisma/client';
import type { ToolDefinition } from '../openrouter';
import { maskPhonesDeep } from './mask-pii';

const RESULT_MAX_CHARS = 12_000;
const DESCRIPTION_MAX_CHARS = 400;

// Mêmes rôles que le serveur MCP : ADMIN/MANAGER tout, COMPTABLE finance,
// ANALYSTE lecture seule. Les autres rôles n'ont pas d'assistant.
const ASSISTANT_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'COMPTABLE',
  'ANALYSTE',
];

// Outils qui transportent une image en base64 : inutilisables depuis un chat
// textuel et très coûteux en jetons.
const EXCLUDED = /^set_.*(image|receipt|document)$/;

// Outils écartés pour l'assistant : `get_menu` renvoie tout le menu (bien au-delà
// de RESULT_MAX_CHARS, sans paramètre pour affiner → boucle) et
// `toggle_product_availability` inverse l'état (non idempotent) ; remplacés par
// `search_products` et `set_product_availability`.
const ASSISTANT_EXCLUDED_TOOLS = new Set([
  'get_menu',
  'toggle_product_availability',
]);

export function canUseAssistant(role: UserRole): boolean {
  return ASSISTANT_ROLES.includes(role);
}

function allowedForRole(tool: McpTool, role: UserRole): boolean {
  if (EXCLUDED.test(tool.name) || ASSISTANT_EXCLUDED_TOOLS.has(tool.name)) {
    return false;
  }
  if (role === 'COMPTABLE') return tool.scope === 'finance';
  if (role === 'ANALYSTE') return tool.readOnly;
  return role === 'ADMIN' || role === 'MANAGER';
}

export function assistantTools(role: UserRole): McpTool[] {
  return tools.filter((t) => allowedForRole(t, role));
}

const definitionCache = new Map<string, ToolDefinition>();

function toDefinition(tool: McpTool): ToolDefinition {
  let def = definitionCache.get(tool.name);
  if (!def) {
    const parameters = z.toJSONSchema(tool.inputSchema, {
      io: 'input',
    }) as Record<string, unknown>;
    delete parameters.$schema;
    def = {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description.slice(0, DESCRIPTION_MAX_CHARS),
        parameters,
      },
    };
    definitionCache.set(tool.name, def);
  }
  return def;
}

export function assistantToolDefinitions(role: UserRole): ToolDefinition[] {
  return assistantTools(role).map(toDefinition);
}

// Brouillons d'achat : persistés avec une durée de vie limitée mais SANS rien
// écrire de définitif (dépense, article). Exécutés sans confirmation ; seul
// `confirm_*` enregistre — et passe par la carte Confirmer / Refuser.
const DRAFT_TOOLS = new Set(['prepare_purchase', 'prepare_other_expense']);

/** Une action qui modifie des données exige l'accord de l'utilisateur. */
export function isWriteTool(name: string): boolean {
  if (DRAFT_TOOLS.has(name)) return false;
  const tool = toolsByName.get(name);
  return !tool || !tool.readOnly;
}

/** Libellé lisible d'un outil, pour la carte de confirmation. */
export function toolTitle(name: string): string {
  return toolsByName.get(name)?.title ?? name;
}

export async function runAssistantTool(
  name: string,
  rawArgs: string,
  role: UserRole
): Promise<{ ok: boolean; content: string }> {
  const tool = toolsByName.get(name);
  if (!tool || !allowedForRole(tool, role)) {
    return { ok: false, content: 'Outil non autorisé pour ce rôle.' };
  }

  let args: unknown;
  try {
    args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, content: 'Arguments illisibles (JSON invalide).' };
  }

  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      content:
        'Arguments invalides : ' + JSON.stringify(z.flattenError(parsed.error)),
    };
  }

  try {
    const data = await runWithStockContext({ source: 'MCP' }, () =>
      tool.handler(parsed.data)
    );
    if (!tool.readOnly && !DRAFT_TOOLS.has(name)) revalidateMenu();
    // Données personnelles : numéros masqués avant tout envoi au modèle.
    const text =
      data === undefined || data === null
        ? 'OK'
        : JSON.stringify(maskPhonesDeep(data));
    return {
      ok: true,
      content:
        text.length > RESULT_MAX_CHARS
          ? `${text.slice(0, RESULT_MAX_CHARS)}… [RÉSULTAT TRONQUÉ : n'appelle pas cet outil à nouveau à l'identique ; utilise un outil de recherche plus ciblé ou demande une précision à l'utilisateur]`
          : text,
    };
  } catch (err) {
    return {
      ok: false,
      content: err instanceof Error ? err.message : String(err),
    };
  }
}
