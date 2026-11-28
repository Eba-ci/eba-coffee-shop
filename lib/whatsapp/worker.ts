// lib/whatsapp/worker.ts
//
// Worker BullMQ : un tour par travail, verrou par conversation, balayage de secours.
// Aucun contenu de message dans les journaux : identifiants et codes seulement.

import { DelayedError, Worker } from 'bullmq';
import {
  WHATSAPP_LOCK_RETRY_MS,
  WHATSAPP_QUEUE_NAME,
  WHATSAPP_SWEEP_INTERVAL_MS,
  WHATSAPP_SWEEP_MIN_AGE_MS,
  WHATSAPP_TURN_LOCK_MS,
  WHATSAPP_WORKER_CONCURRENCY,
} from '@/config/constants/whatsapp';
import { errorLabel } from '@/lib/whatsapp/ingest';
import { acquireLock, releaseLock, turnLockKey } from '@/lib/whatsapp/lock';
import { processTurn, type TurnRunner } from '@/lib/whatsapp/process-turn';
import { enqueueTurn, type TurnJob } from '@/lib/whatsapp/queue';
import { redisUrl, workerConnection } from '@/lib/whatsapp/redis';
import { findIdleConversations } from '@/lib/whatsapp/turn';

/** Remet en file les conversations restées sans réponse (Redis vidé, travail perdu). */
export async function sweepIdleConversations(): Promise<number> {
  const idle = await findIdleConversations(WHATSAPP_SWEEP_MIN_AGE_MS);
  let queued = 0;
  for (const { id, inboundVersion } of idle) {
    const job = { conversationId: id, version: inboundVersion };
    if (await enqueueTurn(job, 0)) queued++;
  }
  return queued;
}

export type WhatsAppWorker = { close: () => Promise<void> };

export function startWhatsAppWorker(runner?: TurnRunner): WhatsAppWorker {
  const url = redisUrl();
  if (!url)
    throw new Error('REDIS_URL absente : le worker WhatsApp ne démarre pas.');

  const connection = workerConnection(url);
  const lockRedis = workerConnection(url);

  const worker = new Worker<TurnJob>(
    WHATSAPP_QUEUE_NAME,
    async (job, token) => {
      const key = turnLockKey(job.data.conversationId);
      const lock = await acquireLock(lockRedis, key, WHATSAPP_TURN_LOCK_MS);
      if (!lock) {
        // Conversation occupée : on repasse plus tard, sans compter un échec.
        await job.moveToDelayed(Date.now() + WHATSAPP_LOCK_RETRY_MS, token);
        throw new DelayedError();
      }
      try {
        return await processTurn(job.data, runner);
      } finally {
        await releaseLock(lockRedis, key, lock);
      }
    },
    { connection, concurrency: WHATSAPP_WORKER_CONCURRENCY }
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[whatsapp-worker] tour ${job?.id ?? '?'} échoué (${errorLabel(err)})`
    );
  });

  const sweeper = setInterval(() => {
    sweepIdleConversations().catch((err) =>
      console.error(`[whatsapp-worker] balayage échoué (${errorLabel(err)})`)
    );
  }, WHATSAPP_SWEEP_INTERVAL_MS);

  return {
    close: async () => {
      clearInterval(sweeper);
      await worker.close();
      lockRedis.disconnect();
      connection.disconnect();
    },
  };
}
