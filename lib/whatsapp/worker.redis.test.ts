// lib/whatsapp/worker.redis.test.ts
//
// File et worker contre un VRAI Redis (REDIS_TEST_URL, ex. redis://localhost:6379/15),
// sautés sans lui. Vérifie l'anti-rebond et l'exclusion par conversation.

import IORedis from 'ioredis';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const REDIS = process.env.REDIS_TEST_URL;

// Base simulée : seules les versions comptent pour ces scénarios.
const state = vi.hoisted(
  () => new Map<string, { inbound: number; done: number }>()
);
vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/lib/whatsapp/turn', () => ({
  claimTurn: async (id: string, version: number) => {
    const c = state.get(id);
    if (!c) return 'missing';
    if (c.done >= version) return 'done';
    return c.inbound > version ? 'stale' : 'ready';
  },
  completeTurn: async (id: string, version: number) => {
    const c = state.get(id)!;
    if (c.inbound !== version || c.done >= version) return false;
    c.done = version;
    return true;
  },
  findIdleConversations: async () => [],
}));

import { enqueueTurn } from './queue';
import type { TurnRunner } from './process-turn';
import { startWhatsAppWorker, type WhatsAppWorker } from './worker';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(25);
}

describe.skipIf(!REDIS)('worker WhatsApp (Redis réel)', () => {
  let worker: WhatsAppWorker | null = null;
  let admin: IORedis;
  const runs: { id: string; version: number }[] = [];
  let running = 0;
  let maxRunning = 0;
  let runnerMs = 0;

  const runner: TurnRunner = async ({ conversationId, version }) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    runs.push({ id: conversationId, version });
    await sleep(runnerMs);
    running--;
    return { reply: `réponse ${version}` };
  };

  beforeAll(() => {
    process.env.REDIS_URL = REDIS;
    admin = new IORedis(REDIS!);
  });

  beforeEach(async () => {
    await worker?.close();
    await admin.flushdb();
    state.clear();
    runs.length = 0;
    running = 0;
    maxRunning = 0;
    runnerMs = 0;
    worker = startWhatsAppWorker(runner);
  });

  afterAll(async () => {
    await worker?.close();
    admin.disconnect();
  });

  it('trois messages rapprochés : un seul tour, sur la dernière version', async () => {
    state.set('c1', { inbound: 0, done: 0 });
    for (const version of [1, 2, 3]) {
      state.get('c1')!.inbound = version;
      await enqueueTurn({ conversationId: 'c1', version }, 300);
      await sleep(50);
    }
    await until(() => state.get('c1')!.done === 3);
    await sleep(600);

    expect(runs).toEqual([{ id: 'c1', version: 3 }]);
  });

  it('un message pendant le tour : jamais deux tours en même temps, réponse caduque écartée', async () => {
    runnerMs = 500;
    state.set('c2', { inbound: 1, done: 0 });
    await enqueueTurn({ conversationId: 'c2', version: 1 }, 0);
    await until(() => runs.length === 1);

    state.get('c2')!.inbound = 2;
    await enqueueTurn({ conversationId: 'c2', version: 2 }, 0);
    await until(() => state.get('c2')!.done === 2, 10_000);

    expect(runs.map((r) => r.version)).toEqual([1, 2]);
    expect(maxRunning).toBe(1);
    expect(state.get('c2')!.done).toBe(2);
  });

  it('deux conversations tournent en parallèle', async () => {
    runnerMs = 400;
    for (const id of ['a', 'b']) {
      state.set(id, { inbound: 1, done: 0 });
      await enqueueTurn({ conversationId: id, version: 1 }, 0);
    }
    await until(() => state.get('a')!.done === 1 && state.get('b')!.done === 1);

    expect(maxRunning).toBe(2);
  });

  it('un travail rejoué (même version) ne relance pas l’agent', async () => {
    state.set('c3', { inbound: 1, done: 0 });
    await enqueueTurn({ conversationId: 'c3', version: 1 }, 0);
    await until(() => state.get('c3')!.done === 1);
    await enqueueTurn({ conversationId: 'c3', version: 1 }, 0);
    await sleep(500);

    expect(runs).toHaveLength(1);
  });
});
