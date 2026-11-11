import { NextResponse } from 'next/server';
import { withMcpAuth } from 'better-auth/plugins';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  FINANCE_TOOL_NAMES,
  NON_ADMIN_TOOL_NAMES,
  READ_ONLY_TOOL_NAMES,
} from '@/lib/mcp/tools';
import type { UserRole } from '@/generated/prisma/client';
import { intersectAllowedTools, resolveToolsetParam } from './toolset';

const MCP_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'];

function forbidden(): Response {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message: 'Accès refusé : rôle non autorisé pour le serveur MCP',
      },
    },
    { status: 403 }
  );
}

/**
 * `withMcpAuth` valide le jeton OAuth (401 + `WWW-Authenticate` sinon), puis
 * on exige un rôle autorisé. COMPTABLE → outils finance ; ANALYSTE → outils en
 * lecture seule (hors admin) ; MANAGER → tout SAUF les outils `scope: 'admin'`
 * (le détail de la paie reste à l'ADMIN) ; ADMIN → tout.
 */
export function withRoleGuard(
  handler: (
    req: Request,
    allowedTools?: Set<string>
  ) => Response | Promise<Response>
) {
  return withMcpAuth(auth, async (req, session) => {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, disabledAt: true },
    });
    if (!user || user.disabledAt || !MCP_ROLES.includes(user.role))
      return forbidden();
    const roleAllowedTools =
      user.role === 'COMPTABLE'
        ? FINANCE_TOOL_NAMES
        : user.role === 'ANALYSTE'
          ? READ_ONLY_TOOL_NAMES
          : user.role === 'MANAGER'
            ? NON_ADMIN_TOOL_NAMES
            : undefined;

    const toolset = resolveToolsetParam(req);
    if (toolset instanceof Response) return toolset;

    return handler(
      req,
      intersectAllowedTools(roleAllowedTools, toolset.allowedTools)
    );
  });
}
