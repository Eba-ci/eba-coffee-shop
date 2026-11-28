// lib/whatsapp/lock.ts
//
// Verrou Redis par conversation : deux tours de la même conversation ne tournent jamais
// en même temps. Expire seul si le worker meurt en plein tour.

import { randomUUID } from 'node:crypto';
import type IORedis from 'ioredis';

const RELEASE = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export const turnLockKey = (conversationId: string) =>
  `whatsapp:turn:${conversationId}`;

/** Renvoie le jeton du verrou, ou `null` si la conversation est déjà occupée. */
export async function acquireLock(
  redis: IORedis,
  key: string,
  ttlMs: number
): Promise<string | null> {
  const token = randomUUID();
  const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
  return ok === 'OK' ? token : null;
}

/** Ne libère que son propre verrou (un verrou expiré puis repris n'est pas touché). */
export async function releaseLock(
  redis: IORedis,
  key: string,
  token: string
): Promise<void> {
  await redis.eval(RELEASE, 1, key, token);
}
