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

import { whatsappAppSecret, whatsappVerifyToken } from '@/lib/whatsapp/config';
import { GET, POST } from './route';

const TOKEN = 'jeton-de-verification';
const SECRET = 'app_secret_test';
const verifyToken = vi.mocked(whatsappVerifyToken);
const appSecret = vi.mocked(whatsappAppSecret);

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

  beforeEach(() => {
    vi.resetAllMocks();
    appSecret.mockReturnValue(SECRET);
  });

  it("est inerte (404) quand la clé secrète n'est pas configurée", async () => {
    appSecret.mockReturnValue('');
    expect((await notify(body)).status).toBe(404);
  });

  it('refuse (401) une signature absente, invalide ou sans préfixe', async () => {
    expect((await notify(body, null)).status).toBe(401);
    expect((await notify(body, `sha256=${'a'.repeat(64)}`)).status).toBe(401);
    expect((await notify(body, sign(body).slice(7))).status).toBe(401);
  });

  it('vérifie la signature sur le corps brut, pas sur un JSON re-sérialisé', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect((await notify(pretty, sign(body))).status).toBe(401);
    expect((await notify(pretty, sign(pretty))).status).toBe(200);
  });

  it('acquitte (200) une notification correctement signée', async () => {
    const res = await notify(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
