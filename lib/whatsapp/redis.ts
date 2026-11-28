// lib/whatsapp/redis.ts
//
// Connexion Redis de la file WhatsApp. `REDIS_URL` absente = file désactivée : le webhook
// enregistre toujours les messages, rien n'est mis en file.

import IORedis from 'ioredis';

export function redisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}

/** Le producteur échoue vite si Redis est coupé : le webhook ne doit jamais rester suspendu. */
export function producerConnection(url: string): IORedis {
  return new IORedis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
}

/** BullMQ exige `maxRetriesPerRequest: null` pour les connexions bloquantes du worker. */
export function workerConnection(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}
