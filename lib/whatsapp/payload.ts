// lib/whatsapp/payload.ts
//
// Lecture du JSON envoyé par Meta au webhook WhatsApp (champ `messages`). Un seul
// POST peut contenir jusqu'à 1 000 mises à jour (messages et statuts mêlés) : chaque
// élément est lu à part, un élément illisible est ignoré sans faire échouer le lot.
//
// Meta peut identifier l'expéditeur par un identifiant propre à l'entreprise (BSUID,
// `user_id` / `from_user_id`) et omettre son numéro (`from`) s'il a adopté un nom
// d'utilisateur : les deux sont donc facultatifs ici.
//
// On ne garde du média que son identifiant : le fichier se récupère chez Meta à la
// demande, il n'est pas stocké.

import { z } from 'zod';

export type InboundMessage = {
  wamid: string;
  /** Identifiant propre à l'entreprise (BSUID). */
  userId: string | null;
  /** Numéro de l'expéditeur, chiffres seuls avec l'indicatif, sans `+`. */
  waId: string | null;
  /** Type tel que Meta le nomme : text, interactive, audio, image… */
  type: string;
  body: string | null;
  payload: Record<string, string> | null;
  sentAt: Date;
};

export type StatusKind = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export type StatusUpdate = {
  wamid: string;
  status: StatusKind;
  errorCode: number | null;
  errorTitle: string | null;
};

export type ParsedWebhook = {
  messages: InboundMessage[];
  statuses: StatusUpdate[];
};

const media = z.looseObject({
  id: z.string().optional(),
  mime_type: z.string().optional(),
  caption: z.string().optional(),
});

const reply = z.looseObject({
  id: z.string().optional(),
  title: z.string().optional(),
});

const messageSchema = z.looseObject({
  id: z.string().min(1),
  from: z.string().min(1).optional(),
  from_user_id: z.string().min(1).optional(),
  timestamp: z.string().optional(),
  type: z.string().min(1).optional(),
  text: z.looseObject({ body: z.string().optional() }).optional(),
  interactive: z
    .looseObject({
      button_reply: reply.optional(),
      list_reply: reply.optional(),
    })
    .optional(),
  button: z
    .looseObject({
      text: z.string().optional(),
      payload: z.string().optional(),
    })
    .optional(),
  audio: media.optional(),
  image: media.optional(),
  video: media.optional(),
  document: media.optional(),
  sticker: media.optional(),
});

const statusSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string(),
  errors: z
    .array(
      z.looseObject({
        code: z.number().optional(),
        title: z.string().optional(),
      })
    )
    .optional(),
});

const valueSchema = z.looseObject({
  messages: z.array(z.unknown()).optional(),
  statuses: z.array(z.unknown()).optional(),
});

const webhookSchema = z.looseObject({
  object: z.string().optional(),
  entry: z
    .array(
      z.looseObject({
        changes: z
          .array(z.looseObject({ field: z.string(), value: z.unknown() }))
          .optional(),
      })
    )
    .optional(),
});

const STATUS_KINDS: Record<string, StatusKind> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

const MEDIA_TYPES = ['audio', 'image', 'video', 'document', 'sticker'] as const;

function toDate(timestamp: string | undefined): Date {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : new Date();
}

function compact(entries: Record<string, string | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function toInbound(raw: z.infer<typeof messageSchema>): InboundMessage {
  const type = raw.type ?? 'unknown';
  let body: string | null = null;
  let payload: Record<string, string> | null = null;

  if (type === 'text') {
    body = raw.text?.body ?? null;
  } else if (type === 'interactive') {
    const choice = raw.interactive?.button_reply ?? raw.interactive?.list_reply;
    body = choice?.title ?? null;
    payload = compact({ buttonId: choice?.id });
  } else if (type === 'button') {
    body = raw.button?.text ?? null;
    payload = compact({ buttonId: raw.button?.payload });
  } else if ((MEDIA_TYPES as readonly string[]).includes(type)) {
    const file = raw[type as (typeof MEDIA_TYPES)[number]];
    body = file?.caption ?? null;
    payload = compact({ mediaId: file?.id, mimeType: file?.mime_type });
  }

  return {
    wamid: raw.id,
    userId: raw.from_user_id ?? null,
    waId: raw.from ?? null,
    type,
    body,
    payload,
    sentAt: toDate(raw.timestamp),
  };
}

function toStatus(raw: z.infer<typeof statusSchema>): StatusUpdate | null {
  const status = STATUS_KINDS[raw.status];
  if (!status) return null;
  const error = raw.errors?.[0];
  return {
    wamid: raw.id,
    status,
    errorCode: status === 'FAILED' ? (error?.code ?? null) : null,
    errorTitle: status === 'FAILED' ? (error?.title ?? null) : null,
  };
}

/** Extrait messages et statuts d'un corps de webhook déjà décodé. */
export function parseWebhook(body: unknown): ParsedWebhook {
  const result: ParsedWebhook = { messages: [], statuses: [] };

  const webhook = webhookSchema.safeParse(body);
  if (!webhook.success || webhook.data.object !== 'whatsapp_business_account') {
    return result;
  }

  for (const entry of webhook.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = valueSchema.safeParse(change.value);
      if (!value.success) continue;

      for (const item of value.data.messages ?? []) {
        const message = messageSchema.safeParse(item);
        if (message.success) result.messages.push(toInbound(message.data));
      }
      for (const item of value.data.statuses ?? []) {
        const status = statusSchema.safeParse(item);
        const update = status.success ? toStatus(status.data) : null;
        if (update) result.statuses.push(update);
      }
    }
  }
  return result;
}
