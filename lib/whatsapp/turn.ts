// lib/whatsapp/turn.ts
//
// Anti-rebond d'un tour de l'agent : on ne répond qu'à la dernière version reçue.
// `processedVersion` n'avance que si aucun message n'est arrivé pendant le tour.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

export type TurnState = 'ready' | 'stale' | 'done' | 'missing';

/** Avant de travailler : le tour est-il encore le bon ? */
export async function claimTurn(
  conversationId: string,
  version: number
): Promise<TurnState> {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: { inboundVersion: true, processedVersion: true },
  });
  if (!conversation) return 'missing';
  if (conversation.processedVersion >= version) return 'done';
  // Un message plus récent a son propre travail en file : celui-ci s'efface.
  if (conversation.inboundVersion > version) return 'stale';
  return 'ready';
}

/** Après le travail : faux si un message est arrivé entre-temps (la réponse est caduque). */
export async function completeTurn(
  conversationId: string,
  version: number
): Promise<boolean> {
  const { count } = await prisma.whatsAppConversation.updateMany({
    where: {
      id: conversationId,
      inboundVersion: version,
      processedVersion: { lt: version },
    },
    data: { processedVersion: version },
  });
  return count === 1;
}

export type IdleConversation = { id: string; inboundVersion: number };

/** Conversations dont le dernier message attend encore une réponse depuis `minAgeMs`. */
export async function findIdleConversations(
  minAgeMs: number,
  now = new Date(),
  limit = 100
): Promise<IdleConversation[]> {
  const before = new Date(now.getTime() - minAgeMs);
  return prisma.$queryRaw<IdleConversation[]>(Prisma.sql`
    SELECT "id", "inboundVersion"
    FROM "whatsapp_conversation"
    WHERE "processedVersion" < "inboundVersion" AND "lastInboundAt" < ${before}
    ORDER BY "lastInboundAt"
    LIMIT ${limit}
  `);
}
