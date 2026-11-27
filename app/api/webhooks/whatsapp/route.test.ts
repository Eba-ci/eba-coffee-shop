// app/api/webhooks/whatsapp/route.test.ts
//
// Webhook WhatsApp. Règles : variable absente = route inerte (404) ; le GET renvoie
// le challenge en texte brut seulement si mode et jeton sont bons ; le POST vérifie
// la signature sur le corps BRUT avant toute lecture.

import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/whatsapp/config', () => ({
  whatsappVerifyToken: vi.fn(),
  whatsappAppSecret: vi.fn(),
}));
vi.mock('@/lib/whatsapp/ingest', () => ({
  ingestInboundMessages: vi.fn(),
  applyStatusUpdates: vi.fn(),
  errorLabel: (err: unknown) => (err instanceof Error ? err.name : 'inconnue'),
}));

import { whatsappAppSecret, whatsappVerifyToken } from '@/lib/whatsapp/config';
import {
  applyStatusUpdates,
  ingestInboundMessages,
} from '@/lib/whatsapp/ingest';
import { GET, POST } from './route';

const TOKEN = 'jeton-de-verification';
const SECRET = 'app_secret_test';
const verifyToken = vi.mocked(whatsappVerifyToken);
const appSecret = vi.mocked(whatsappAppSecret);
const ingest = vi.mocked(ingestInboundMessages);
const applyStatuses = vi.mocked(applyStatusUpdates);

const URL_BASE = 'http://localhost/api/webhooks/whatsapp';

function verify(params: Record<string, string>) {
  const url = new URL(URL_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return GET(new Request(url));
}

const sign = (raw: string) =>
  `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;

function notify(raw: string, signature: string | null = sign(raw)) {
  return POST(
    new Request(URL_BASE, {
      method: 'POST',
      body: raw,
      headers: signature ? { 'X-Hub-Signature-256': signature } : {},
    })
  );
}

describe('GET /api/webhooks/whatsapp', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    verifyToken.mockReturnValue(TOKEN);
  });

  it("est inerte (404) quand le jeton n'est pas configuré", async () => {
    verifyToken.mockReturnValue('');
    const res = await verify({
      'hub.mode': 'subscribe',
      'hub.verify_token': '',
      'hub.challenge': '1234',
    });
    expect(res.status).toBe(404);
  });

  it('renvoie le challenge en texte brut quand le jeton est bon', async () => {
    const res = await verify({
      'hub.mode': 'subscribe',
      'hub.verify_token': TOKEN,
      'hub.challenge': '1158201444',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('1158201444');
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('refuse (403) un mauvais jeton, un mauvais mode ou un challenge absent', async () => {
    const wrongToken = await verify({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'faux',
      'hub.challenge': '1234',
    });
    const wrongMode = await verify({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': TOKEN,
      'hub.challenge': '1234',
    });
    const noChallenge = await verify({
      'hub.mode': 'subscribe',
      'hub.verify_token': TOKEN,
    });
    expect(wrongToken.status).toBe(403);
    expect(wrongMode.status).toBe(403);
    expect(noChallenge.status).toBe(403);
  });

  it('refuse (403) une requête sans jeton', async () => {
    const res = await verify({
      'hub.mode': 'subscribe',
      'hub.challenge': '1234',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/webhooks/whatsapp', () => {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [],
  });

  const withMessage = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              messages: [
                {
                  from: '2250707070707',
                  id: 'wamid.1',
                  timestamp: '1749416383',
                  type: 'text',
                  text: { body: 'Bonjour' },
                },
              ],
              statuses: [{ id: 'wamid.2', status: 'delivered' }],
            },
          },
        ],
      },
    ],
  });

  beforeEach(() => {
    vi.resetAllMocks();
    appSecret.mockReturnValue(SECRET);
    ingest.mockResolvedValue([]);
    applyStatuses.mockResolvedValue(0);
  });

  it("est inerte (404) quand la clé secrète n'est pas configurée", async () => {
    appSecret.mockReturnValue('');
    expect((await notify(body)).status).toBe(404);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('refuse (401) une signature absente, invalide ou sans préfixe, sans rien enregistrer', async () => {
    expect((await notify(withMessage, null)).status).toBe(401);
    expect((await notify(withMessage, `sha256=${'a'.repeat(64)}`)).status).toBe(
      401
    );
    expect((await notify(withMessage, sign(withMessage).slice(7))).status).toBe(
      401
    );
    expect(ingest).not.toHaveBeenCalled();
    expect(applyStatuses).not.toHaveBeenCalled();
  });

  it('vérifie la signature sur le corps brut, pas sur un JSON re-sérialisé', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect((await notify(pretty, sign(body))).status).toBe(401);
    expect((await notify(pretty, sign(pretty))).status).toBe(200);
  });

  it('acquitte (200) une notification correctement signée, vide ou non', async () => {
    const res = await notify(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, messages: 0, statuses: 0 });
  });

  it('enregistre les messages et les statuts lus dans le corps, et compte le nouveau', async () => {
    ingest.mockResolvedValue([
      { conversationId: 'c1', version: 1, wamid: 'wamid.1' },
    ]);
    applyStatuses.mockResolvedValue(1);

    const res = await notify(withMessage);

    expect(ingest).toHaveBeenCalledWith([
      expect.objectContaining({
        wamid: 'wamid.1',
        waId: '2250707070707',
        body: 'Bonjour',
      }),
    ]);
    expect(applyStatuses).toHaveBeenCalledWith([
      expect.objectContaining({ wamid: 'wamid.2', status: 'DELIVERED' }),
    ]);
    expect(await res.json()).toEqual({ ok: true, messages: 1, statuses: 1 });
  });

  it('acquitte (200) un corps signé mais illisible, sans rien enregistrer', async () => {
    const res = await notify('pas du json');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('répond 500 quand la base échoue pour que Meta rejoue, sans journaliser le contenu', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    ingest.mockRejectedValue(new TypeError('Bonjour 0707070707'));

    const res = await notify(withMessage);

    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0])).not.toContain('Bonjour');
    expect(String(log.mock.calls[0])).not.toContain('0707070707');
    log.mockRestore();
  });
});
