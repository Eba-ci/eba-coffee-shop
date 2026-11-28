// config/constants/whatsapp.ts
//
// File d'attente du bot WhatsApp : anti-rebond, verrou de tour et balayage de secours.

export const WHATSAPP_QUEUE_NAME = 'whatsapp-inbound';

/** Attente après un message avant de répondre : le client finit souvent sa phrase en plusieurs. */
export const WHATSAPP_DEBOUNCE_MS = 2_500;

/** Durée max d'un tour de l'agent ; le verrou de conversation expire au-delà. */
export const WHATSAPP_TURN_LOCK_MS = 60_000;

/** Reprise d'un tour quand la conversation est déjà occupée par un autre. */
export const WHATSAPP_LOCK_RETRY_MS = 1_000;

/** Le balayage relance les conversations restées sans réponse (Redis vidé, worker coupé). */
export const WHATSAPP_SWEEP_INTERVAL_MS = 30_000;
export const WHATSAPP_SWEEP_MIN_AGE_MS = 30_000;

/** Tours traités en parallèle par le worker (une conversation à la fois, grâce au verrou). */
export const WHATSAPP_WORKER_CONCURRENCY = 10;
