// lib/whatsapp/webhook-auth.ts
//
// Authentification du webhook WhatsApp de Meta, dans les deux sens :
//   - `verifyWebhookToken` : le GET de vérification (`hub.verify_token`) ;
//   - `verifyMetaSignature` : chaque POST porte l'en-tête
//     `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 du corps BRUT calculé avec la
//     clé secrète de l'app. Ce n'est pas un réglage du tableau de bord Meta : c'est
//     un en-tête HTTP que Meta ajoute à chaque envoi.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE = /^sha256=([0-9a-f]{64})$/i;

/**
 * Vérifie la signature sur le texte reçu tel quel, jamais sur un JSON re-sérialisé.
 * Secret absent : on refuse tout plutôt que de valider un HMAC à clé vide.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string
): boolean {
  if (!appSecret || !header) return false;
  const match = SIGNATURE.exec(header);
  if (!match) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(match[1], 'hex'));
}

/**
 * Compare le jeton reçu au jeton attendu en temps constant. Les deux sont passés
 * par SHA-256 : longueur fixe, donc `timingSafeEqual` ne lève jamais et ne révèle
 * pas la longueur du jeton attendu.
 */
export function verifyWebhookToken(
  received: string | null,
  expected: string
): boolean {
  if (!expected || !received) return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
