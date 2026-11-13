// Serveur MCP distant (transport « Streamable HTTP ») : administration de
// l'app pour un client comme Claude. Doc : app/api/mcp/README.md.
//
// Auth, dans l'ordre :
//   1. Jeton statique `MCP_API_KEY` en Bearer (optionnel, clients « machine »).
//      La clé statique n'a PAS le scope `admin` : le détail des salaires est
//      réservé à un compte ADMIN identifié (OAuth).
//   2. OAuth 2.0 (plugin MCP de Better Auth) : comptes ADMIN, MANAGER,
//      COMPTABLE (outils finance, `FINANCE_TOOL_NAMES`) ou ANALYSTE (lecture
//      seule, `READ_ONLY_TOOL_NAMES`).
// `?toolset=` restreint en plus, par intersection avec le rôle.
//
// Le dispatch JSON-RPC vit dans `lib/mcp/handler.ts` ; le transport HTTP
// (auth, parsing, SSE, cache) dans `lib/mcp/http/`.

import { withCors, corsPreflight } from '@/lib/mcp/cors';
import { processRpc } from '@/lib/mcp/http/rpc';
import { withRoleGuard } from '@/lib/mcp/http/role-guard';
import { sseStream } from '@/lib/mcp/http/sse';
import { matchesStaticKey } from '@/lib/mcp/http/static-key';
import {
  resolveToolsetParam,
  intersectAllowedTools,
} from '@/lib/mcp/http/toolset';
import { NON_ADMIN_TOOL_NAMES } from '@/lib/mcp/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const oauthPostHandler = withRoleGuard(processRpc);
const oauthGetHandler = withRoleGuard(() => sseStream());

export async function POST(req: Request): Promise<Response> {
  // 1. Clé statique (propriétaire / clients « machine »). Pas de scope `admin` :
  // le détail des salaires exige un compte ADMIN identifié (OAuth).
  if (matchesStaticKey(req)) {
    const toolset = resolveToolsetParam(req);
    if (toolset instanceof Response) return withCors(toolset, req);
    const allowedTools = intersectAllowedTools(
      NON_ADMIN_TOOL_NAMES,
      toolset.allowedTools
    );
    return withCors(await processRpc(req, allowedTools), req);
  }
  // 2. OAuth (administrateurs via Claude web/mobile/desktop).
  return withCors(await oauthPostHandler(req), req);
}

export const OPTIONS = corsPreflight;

export async function GET(req: Request): Promise<Response> {
  // 1. Clé statique. `?toolset=` validé même si le flux est vide : mieux vaut
  // un 400 immédiat qu'un échec tardif sur le premier `tools/list`.
  if (matchesStaticKey(req)) {
    const toolset = resolveToolsetParam(req);
    if (toolset instanceof Response) return withCors(toolset, req);
    return withCors(sseStream(), req);
  }
  // 2. OAuth. Sans jeton valide → 401 + WWW-Authenticate.
  return withCors(await oauthGetHandler(req), req);
}
