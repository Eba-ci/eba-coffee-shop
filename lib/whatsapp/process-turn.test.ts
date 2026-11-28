// lib/whatsapp/process-turn.test.ts
//
// Un tour n'appelle l'agent que s'il est encore le bon, et sa réponse n'est valable
// que si le tour est validé.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/whatsapp/turn', () => ({
  claimTurn: vi.fn(),
  completeTurn: vi.fn(),
}));

import { processTurn } from './process-turn';
import { claimTurn, completeTurn } from './turn';

const job = { conversationId: 'c1', version: 3 };
const claim = vi.mocked(claimTurn);
const complete = vi.mocked(completeTurn);

describe('processTurn', () => {
  beforeEach(() => vi.resetAllMocks());

  it('lance l’agent puis valide, et rend sa réponse', async () => {
    claim.mockResolvedValue('ready');
    complete.mockResolvedValue(true);
    const runner = vi.fn().mockResolvedValue({ reply: 'Bonjour !' });

    expect(await processTurn(job, runner)).toEqual({
      outcome: 'processed',
      reply: 'Bonjour !',
    });
    expect(runner).toHaveBeenCalledWith(job);
  });

  it('n’appelle pas l’agent pour un tour dépassé, traité ou orphelin', async () => {
    const runner = vi.fn();
    for (const state of ['stale', 'done', 'missing'] as const) {
      claim.mockResolvedValue(state);
      expect(await processTurn(job, runner)).toEqual({ outcome: state });
    }
    expect(runner).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('écarte la réponse quand un message est arrivé pendant le tour', async () => {
    claim.mockResolvedValue('ready');
    complete.mockResolvedValue(false);
    const runner = vi.fn().mockResolvedValue({ reply: 'trop tard' });

    expect(await processTurn(job, runner)).toEqual({ outcome: 'superseded' });
  });

  it('sans agent, le tour est validé sans réponse', async () => {
    claim.mockResolvedValue('ready');
    complete.mockResolvedValue(true);
    expect(await processTurn(job)).toEqual({
      outcome: 'processed',
      reply: null,
    });
  });
});
