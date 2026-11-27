// lib/whatsapp/ingest.ts
//
// Enregistrement des messages et statuts reçus par le webhook WhatsApp.
//
// - Idempotent : Meta rejoue ses envois jusqu'à 7 jours, `wamid` est unique. Un message
//   déjà vu est ignoré sans toucher au compteur de la conversation.
// - Chaque nouveau message augmente `inboundVersion` de la conversation et en garde le
//   numéro (`version`) : les messages à traiter sont ceux de `version > processedVersion`.
// - L'expéditeur est identifié par le BSUID (`userId`) et/ou le numéro (`waId`), tous
//   deux facultatifs. Une conversation se retrouve par l'un ou l'autre.
// - Un expéditeur dont le numéro (authentifié par WhatsApp) est celui d'une fiche client
//   est rattaché à ce client (`PHONE_MATCH`). Les numéros étrangers n'en trouvent pas :
//   la caisse n'enregistre que des numéros ivoiriens.

import { Prisma } from '@/generated/prisma/client';
import type { WhatsAppMessageStatus } from '@/generated/prisma/enums';
import prisma from '@/lib/prisma';
import type {
  InboundMessage,
  StatusKind,
  StatusUpdate,
} from '@/lib/whatsapp/payload';

type Tx = Prisma.TransactionClient;

export type IngestResult = {
  conversationId: string;
  /** Version de la conversation que ce message a fait naître. */
  version: number;
  wamid: string;
};

/** Une tentative de plus suffit : le second passage retrouve la ligne qui a gagné. */
const MAX_ATTEMPTS = 2;

/** Statuts qu'un statut reçu a le droit de remplacer (Meta les livre dans le désordre). */
const REPLACEABLE: Record<StatusKind, WhatsAppMessageStatus[]> = {
  SENT: ['PENDING'],
  DELIVERED: ['PENDING', 'SENT'],
  READ: ['PENDING', 'SENT', 'DELIVERED'],
  FAILED: ['PENDING', 'SENT'],
};

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/** Libellé d'erreur sans donnée : un message d'erreur Prisma peut citer le contenu. */
export function errorLabel(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  return err instanceof Error ? err.name : 'erreur inconnue';
}

async function findConversation(tx: Tx, msg: InboundMessage) {
  const identifiers: Prisma.WhatsAppConversationWhereInput[] = [];
  if (msg.userId) identifiers.push({ userId: msg.userId });
  if (msg.waId) identifiers.push({ waId: msg.waId });
  if (identifiers.length === 0) return null;

  const rows = await tx.whatsAppConversation.findMany({
    where: { OR: identifiers },
    select: {
      id: true,
      userId: true,
      waId: true,
      customerId: true,
      lastInboundAt: true,
    },
  });
  // Cas rare : deux lignes (l'une par le BSUID, l'autre par le numéro). On garde celle
  // du BSUID et on ne complète aucun identifiant, il appartiendrait à l'autre ligne.
  const primary =
    rows.find((r) => msg.userId && r.userId === msg.userId) ?? rows[0];
  return primary ? { ...primary, canComplete: rows.length === 1 } : null;
}

async function customerIdForWaId(tx: Tx, waId: string) {
  const customer = await tx.customer.findUnique({
    where: { phone: `+${waId}` },
    select: { id: true },
  });
  return customer?.id ?? null;
}

async function storeMessage(
  tx: Tx,
  msg: InboundMessage
): Promise<IngestResult | null> {
  const duplicate = await tx.whatsAppMessage.findUnique({
    where: { wamid: msg.wamid },
    select: { id: true },
  });
  if (duplicate) return null;

  const existing = await findConversation(tx, msg);
  const conversation =
    existing ??
    (await tx.whatsAppConversation.create({
      data: { userId: msg.userId, waId: msg.waId },
      select: {
        id: true,
        userId: true,
        waId: true,
        customerId: true,
        lastInboundAt: true,
      },
    }));
  const canComplete = existing ? existing.canComplete : false;

  const data: Prisma.WhatsAppConversationUpdateInput = {
    inboundVersion: { increment: 1 },
  };
  // Un message rejoué en retard ne fait pas reculer la dernière activité.
  if (!conversation.lastInboundAt || msg.sentAt > conversation.lastInboundAt) {
    data.lastInboundAt = msg.sentAt;
  }
  if (canComplete) {
    if (!conversation.userId && msg.userId) data.userId = msg.userId;
    if (!conversation.waId && msg.waId) data.waId = msg.waId;
  }
  if (!conversation.customerId && msg.waId) {
    const customerId = await customerIdForWaId(tx, msg.waId);
    if (customerId) {
      data.customer = { connect: { id: customerId } };
      data.linkSource = 'PHONE_MATCH';
      data.linkedAt = new Date();
    }
  }

  const { inboundVersion } = await tx.whatsAppConversation.update({
    where: { id: conversation.id },
    data,
    select: { inboundVersion: true },
  });

  await tx.whatsAppMessage.create({
    data: {
      wamid: msg.wamid,
      conversationId: conversation.id,
      direction: 'IN',
      type: msg.type,
      body: msg.body,
      payload: msg.payload ?? undefined,
      status: 'RECEIVED',
      version: inboundVersion,
      sentAt: msg.sentAt,
    },
  });
  return {
    conversationId: conversation.id,
    version: inboundVersion,
    wamid: msg.wamid,
  };
}

async function ingestOne(msg: InboundMessage): Promise<IngestResult | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => storeMessage(tx, msg));
    } catch (err) {
      if (isUniqueViolation(err) && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
}

/**
 * Enregistre les messages reçus, dans l'ordre où ils ont été écrits. Renvoie ceux qui
 * étaient nouveaux (les doublons sont absents) : ce sont eux qui réveilleront l'agent.
 */
export async function ingestInboundMessages(
  messages: InboundMessage[]
): Promise<IngestResult[]> {
  const ordered = [...messages].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
  );
  const stored: IngestResult[] = [];
  for (const msg of ordered) {
    const result = await ingestOne(msg);
    if (result) stored.push(result);
  }
  return stored;
}

/** Met à jour les messages envoyés par nous. Renvoie le nombre de lignes modifiées. */
export async function applyStatusUpdates(
  statuses: StatusUpdate[]
): Promise<number> {
  let updated = 0;
  for (const status of statuses) {
    const result = await prisma.whatsAppMessage.updateMany({
      where: {
        wamid: status.wamid,
        direction: 'OUT',
        status: { in: REPLACEABLE[status.status] },
      },
      data: {
        status: status.status,
        errorCode: status.errorCode,
        errorTitle: status.errorTitle,
      },
    });
    updated += result.count;
  }
  return updated;
}
