// lib/whatsapp/webhook-auth.test.ts
//
// Authentification du webhook WhatsApp : signature HMAC sur le corps BRUT (préfixe
// `sha256=` obligatoire) et jeton de vérification comparé en temps constant.

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature, verifyWebhookToken } from './webhook-auth';

const SECRET = 'app_secret_test';
const BODY = '{"object":"whatsapp_business_account","entry":[]}';
const sign = (raw: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

describe('verifyMetaSignature', () => {
  it('accepte une signature valide', () => {
    expect(verifyMetaSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('accepte les hexadécimaux en majuscules', () => {
    const upper = `sha256=${sign(BODY).slice(7).toUpperCase()}`;
    expect(verifyMetaSignature(BODY, upper, SECRET)).toBe(true);
  });

  it('refuse un corps modifié', () => {
    expect(verifyMetaSignature(`${BODY} `, sign(BODY), SECRET)).toBe(false);
  });

  it('refuse une signature calculée avec un autre secret', () => {
    expect(verifyMetaSignature(BODY, sign(BODY, 'autre'), SECRET)).toBe(false);
  });

  it("refuse l'absence de préfixe, un en-tête absent ou mal formé", () => {
    expect(verifyMetaSignature(BODY, sign(BODY).slice(7), SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, 'sha256=abc', SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, `sha1=${'a'.repeat(40)}`, SECRET)).toBe(
      false
    );
  });

  it('refuse tout quand le secret est vide', () => {
    expect(verifyMetaSignature(BODY, sign(BODY, ''), '')).toBe(false);
  });
});

describe('verifyWebhookToken', () => {
  it('accepte le bon jeton', () => {
    expect(verifyWebhookToken('jeton-secret', 'jeton-secret')).toBe(true);
  });

  it('refuse un jeton faux, de longueur différente, vide ou absent', () => {
    expect(verifyWebhookToken('jeton-faux!', 'jeton-secret')).toBe(false);
    expect(verifyWebhookToken('jeton', 'jeton-secret')).toBe(false);
    expect(verifyWebhookToken('', 'jeton-secret')).toBe(false);
    expect(verifyWebhookToken(null, 'jeton-secret')).toBe(false);
  });

  it('refuse tout quand le jeton attendu est vide', () => {
    expect(verifyWebhookToken('', '')).toBe(false);
    expect(verifyWebhookToken('x', '')).toBe(false);
  });
});
