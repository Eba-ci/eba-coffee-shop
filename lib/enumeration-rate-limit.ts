// lib/enumeration-rate-limit.ts
//
// Freins contre l'énumération de données personnelles (numéros de téléphone,
// identifiants de commande) via des routes qui répondent à une requête unitaire.
// Mémoire du process (cf. lib/rate-limit.ts : frein, pas rempart strict).

import { createRateLimiter } from './rate-limit';

const MINUTE = 60_000;

/** Recherche de clients à la caisse : large pour l'autocomplétion, bornée. */
export const allowCustomerLookup = createRateLimiter(MINUTE, 120);

/** `GET /api/loyalty-info?phone=` public : sonde l'existence d'un client. */
export const allowLoyaltyLookup = createRateLimiter(MINUTE, 20);

/** `GET /api/credit-info?phone=` public : sonde l'existence d'un avoir. */
export const allowCreditLookup = createRateLimiter(MINUTE, 20);

/** `GET /api/commandes/:id` public : polling légitime ≈ 1 requête / 5 s. */
export const allowOrderTrackingRead = createRateLimiter(MINUTE, 60);

/** Première adresse de `x-forwarded-for`, ou `unknown`. */
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** `GET /api/orders/:id/receipt` public : génération d'un PDF, coûteuse. */
export const allowReceiptRead = createRateLimiter(MINUTE, 20);
