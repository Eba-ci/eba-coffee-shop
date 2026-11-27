// lib/whatsapp/config.ts
//
// Lecture de la config WhatsApp (Meta Cloud API) depuis varlock. Fonctions et non
// constantes de module : `ENV` n'est peuplée que dans le runtime Next.js (cf.
// lib/jeko/config.ts). Chaîne vide = variable absente : la route du webhook reste
// inerte (404) tant qu'elle n'est pas renseignée.

import { ENV } from 'varlock/env';

/** Jeton que Meta renvoie en `hub.verify_token` quand il vérifie l'abonnement. */
export function whatsappVerifyToken(): string {
  return ENV.WHATSAPP_VERIFY_TOKEN ?? '';
}

/** Clé secrète de l'app Meta : signe chaque notification (`X-Hub-Signature-256`). */
export function whatsappAppSecret(): string {
  return ENV.WHATSAPP_APP_SECRET ?? '';
}
