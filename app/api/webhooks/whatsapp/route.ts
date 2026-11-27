// app/api/webhooks/whatsapp/route.ts
//
// Webhook WhatsApp (Meta Cloud API) : vérifie l'abonnement, authentifie chaque
// notification et enregistre les messages et statuts reçus (lib/whatsapp/ingest.ts).
// L'agent ne répond pas encore : les messages sont seulement conservés.
//
// - GET : Meta vérifie l'abonnement avec `hub.mode=subscribe`, `hub.verify_token` et
//   `hub.challenge`. Jeton correct : on renvoie le challenge tel quel, en texte brut
//   (200). Sinon 403.
// - POST : la signature `X-Hub-Signature-256` est vérifiée sur le corps BRUT avant
//   toute lecture du JSON. Signature valide : les messages sont enregistrés puis 200
//   (Meta réessaie, puis désactive le webhook, si on tarde ou si on échoue).
// - Variable absente : route inerte (404), comme `/api/webhooks/jeko`.

import { NextResponse } from 'next/server';
import { whatsappAppSecret, whatsappVerifyToken } from '@/lib/whatsapp/config';
import {
  applyStatusUpdates,
  errorLabel,
  ingestInboundMessages,
} from '@/lib/whatsapp/ingest';
import { parseWebhook } from '@/lib/whatsapp/payload';
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

  // Signature valide mais corps illisible : on acquitte, Meta ne renverrait que le
  // même corps pendant 7 jours.
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { messages, statuses } = parseWebhook(body);
  try {
    const stored = await ingestInboundMessages(messages);
    const updated = await applyStatusUpdates(statuses);
    return NextResponse.json({
      ok: true,
      messages: stored.length,
      statuses: updated,
    });
  } catch (err) {
    // 500 : Meta rejoue, et l'ingestion est sans danger à rejouer (`wamid` unique).
    // Jamais le message d'erreur : il peut citer le contenu d'un client.
    console.error(`[whatsapp] ingestion échouée (${errorLabel(err)})`);
    return new Response('Erreur de traitement', { status: 500 });
  }
}
