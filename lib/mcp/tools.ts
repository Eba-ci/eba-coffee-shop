// lib/mcp/tools.ts
//
// Point d'entrée du registre des outils MCP. L'implémentation est découpée par
// domaine dans `lib/mcp/tools/` (un module par domaine fonctionnel, assemblés
// dans `registry.ts`) ; ce fichier ne fait que ré-exporter l'API publique.

export { TOOLSET_NAMES } from './tools/types';
export type { McpTool, ToolsetName } from './tools/types';
export {
  tools,
  toolsByName,
  TOOLSET_TOOL_NAMES,
  FINANCE_TOOL_NAMES,
  ADMIN_ONLY_TOOL_NAMES,
  NON_ADMIN_TOOL_NAMES,
  READ_ONLY_TOOL_NAMES,
} from './tools/registry';
