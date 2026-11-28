// lib/whatsapp/queue.ts
//
// Producteur de la file : un travail différé par conversation et par version de message.
// Postgres reste la source de vérité ; la file n'est qu'un réveil (le balayage rattrape).

import { Queue } from 'bullmq';
import {
  WHATSAPP_DEBOUNCE_MS,
  WHATSAPP_QUEUE_NAME,
} from '@/config/constants/whatsapp';
import { errorLabel } from '@/lib/whatsapp/ingest';
import { producerConnection, redisUrl } from '@/lib/whatsapp/redis';

export type TurnJob = { conversationId: string; version: number };

let queue: Queue<TurnJob> | null = null;

function getQueue(): Queue<TurnJob> | null {
  const url = redisUrl();
  if (!url) return null;
  queue ??= new Queue<TurnJob>(WHATSAPP_QUEUE_NAME, {
    connection: producerConnection(url),
  });
  return queue;
}

/** Id stable : un message rejoué ou un balayage ne crée pas un second travail. */
export function turnJobId(job: TurnJob): string {
  return `${job.conversationId}-${job.version}`;
}

/** Met un tour en file, différé ; renvoie `false` si la file est désactivée. */
export async function enqueueTurn(
  job: TurnJob,
  delayMs = WHATSAPP_DEBOUNCE_MS
): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;
  await q.add('turn', job, {
    jobId: turnJobId(job),
    delay: delayMs,
    removeOnComplete: true,
    removeOnFail: 1_000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
  });
  return true;
}

/** Une seule mise en file par conversation : la dernière version suffit (anti-rebond). */
export function latestTurns(
  results: { conversationId: string; version: number }[]
): TurnJob[] {
  const latest = new Map<string, number>();
  for (const { conversationId, version } of results) {
    latest.set(
      conversationId,
      Math.max(latest.get(conversationId) ?? 0, version)
    );
  }
  return [...latest].map(([conversationId, version]) => ({
    conversationId,
    version,
  }));
}

/** Met en file les tours des messages reçus ; un échec ne fait pas rejouer le webhook. */
export async function enqueueLatestTurns(
  results: { conversationId: string; version: number }[]
): Promise<number> {
  let queued = 0;
  for (const job of latestTurns(results)) {
    try {
      if (await enqueueTurn(job)) queued++;
    } catch (err) {
      // Le message est en base : le balayage du worker reprendra cette conversation.
      console.error(`[whatsapp] mise en file échouée (${errorLabel(err)})`);
    }
  }
  return queued;
}
