// lib/whatsapp/process-turn.ts
//
// Un tour : vérifier qu'il est encore le bon, laisser l'agent travailler, puis valider.
// La réponse n'est utilisable que si le tour est validé (`processed`).

import type { TurnJob } from '@/lib/whatsapp/queue';
import { claimTurn, completeTurn } from '@/lib/whatsapp/turn';

export type TurnReply = { reply: string | null };
export type TurnRunner = (job: TurnJob) => Promise<TurnReply>;

export type TurnOutcome =
  | { outcome: 'processed'; reply: string | null }
  | { outcome: 'stale' | 'done' | 'missing' | 'superseded' };

/** Agent absent (lot suivant) : le tour est validé sans réponse. */
export const silentRunner: TurnRunner = async () => ({ reply: null });

export async function processTurn(
  job: TurnJob,
  runner: TurnRunner = silentRunner
): Promise<TurnOutcome> {
  const state = await claimTurn(job.conversationId, job.version);
  if (state !== 'ready') return { outcome: state };

  const { reply } = await runner(job);
  const validated = await completeTurn(job.conversationId, job.version);
  return validated
    ? { outcome: 'processed', reply }
    : { outcome: 'superseded' };
}
