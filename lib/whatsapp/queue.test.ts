// lib/whatsapp/queue.test.ts
//
// File désactivée sans REDIS_URL ; une seule mise en file par conversation (la dernière
// version) ; un échec Redis n'empêche jamais le webhook de répondre.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const add = vi.hoisted(() => vi.fn());
vi.mock('bullmq', () => ({
  Queue: class {
    add = add;
  },
}));
vi.mock('@/lib/whatsapp/redis', () => ({
  redisUrl: vi.fn(),
  producerConnection: vi.fn(() => ({})),
}));
vi.mock('@/lib/whatsapp/ingest', () => ({
  errorLabel: (err: unknown) => (err instanceof Error ? err.name : 'inconnue'),
}));

import { redisUrl } from '@/lib/whatsapp/redis';
import {
  enqueueLatestTurns,
  enqueueTurn,
  latestTurns,
  turnJobId,
} from './queue';

const url = vi.mocked(redisUrl);

describe('latestTurns', () => {
  it('garde la dernière version de chaque conversation', () => {
    expect(
      latestTurns([
        { conversationId: 'a', version: 1 },
        { conversationId: 'b', version: 4 },
        { conversationId: 'a', version: 3 },
        { conversationId: 'a', version: 2 },
      ])
    ).toEqual([
      { conversationId: 'a', version: 3 },
      { conversationId: 'b', version: 4 },
    ]);
  });
});

describe('enqueueTurn', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    url.mockReturnValue('redis://localhost:6379');
  });

  it('ne fait rien sans REDIS_URL', async () => {
    url.mockReturnValue(null);
    expect(await enqueueTurn({ conversationId: 'a', version: 1 })).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it('met le tour en file, différé, avec un id stable sans « : »', async () => {
    const job = { conversationId: 'a', version: 2 };
    expect(await enqueueTurn(job, 2500)).toBe(true);
    expect(add).toHaveBeenCalledWith(
      'turn',
      job,
      expect.objectContaining({ jobId: 'a-2', delay: 2500 })
    );
    expect(turnJobId(job)).not.toContain(':');
  });
});

describe('enqueueLatestTurns', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    url.mockReturnValue('redis://localhost:6379');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('compte les travaux mis en file, un par conversation', async () => {
    add.mockResolvedValue({});
    const queued = await enqueueLatestTurns([
      { conversationId: 'a', version: 1 },
      { conversationId: 'a', version: 2 },
      { conversationId: 'b', version: 1 },
    ]);
    expect(queued).toBe(2);
  });

  it('avale une panne Redis sans citer d’autre chose que son nom', async () => {
    add.mockRejectedValue(new Error('Redis coupé : contenu du message'));
    expect(
      await enqueueLatestTurns([{ conversationId: 'a', version: 1 }])
    ).toBe(0);
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).not.toContain('contenu du message');
  });
});
