// app/api/webhooks/whatsapp/route.ts
//
// Webhook WhatsApp (Meta Cloud API) : vérifie l'abonnement (GET), authentifie chaque
// notification (POST), enregistre messages et statuts, met le tour de l'agent en file.

import { NextResponse } from 'next/server';
import { whatsappAppSecret, whatsappVerifyToken } from '@/lib/whatsapp/config';
import {
  applyStatusUpdates,
  errorLabel,
  ingestInboundMessages,
} from '@/lib/whatsapp/ingest';
import { parseWebhook } from '@/lib/whatsapp/payload';
import { enqueueLatestTurns } from '@/lib/whatsapp/queue';
import {
  verifyMetaSignature,
  verifyWebhookToken,
} from '@/lib/whatsapp/webhook-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const expected = whatsappVerifyToken();
  if (!expected) {
    return new Response('Non configuré', { status: 404 });
  }

  const params = new URL(req.url).searchParams;
  const challenge = params.get('hub.challenge');
  if (
    params.get('hub.mode') !== 'subscribe' ||
    !challenge ||
    !verifyWebhookToken(params.get('hub.verify_token'), expected)
  ) {
    return new Response('Refusé', { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(req: Request) {
  const secret = whatsappAppSecret();
  if (!secret) {
    return new Response('Non configuré', { status: 404 });
  }

  const raw = await req.text();
  if (
    !verifyMetaSignature(raw, req.headers.get('X-Hub-Signature-256'), secret)
  ) {
    return new Response('Signature invalide', { status: 401 });
  }

  // Signature valide mais corps illisible : on acquitte, Meta rejouerait le même corps.
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { messages, statuses } = parseWebhook(body);
  try {
    // Messages reçus et statuts de nos envois touchent des lignes distinctes.
    const [stored, updated] = await Promise.all([
      ingestInboundMessages(messages),
      applyStatusUpdates(statuses),
    ]);
    const queued = await enqueueLatestTurns(stored);
    return NextResponse.json({
      ok: true,
      messages: stored.length,
      statuses: updated,
      queued,
    });
  } catch (err) {
    // 500 : Meta rejoue, et l'ingestion est sans danger à rejouer (`wamid` unique).
    // Jamais le message d'erreur : il peut citer le contenu d'un client.
    console.error(`[whatsapp] ingestion échouée (${errorLabel(err)})`);
    return new Response('Erreur de traitement', { status: 500 });
  }
}
