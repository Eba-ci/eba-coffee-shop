// lib/whatsapp/turn.test.ts
//
// Anti-rebond : un tour ne répond qu'à la dernière version, et ne valide que si rien
// n'est arrivé pendant qu'il travaillait.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  whatsAppConversation: { findUnique: vi.fn(), updateMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import { claimTurn, completeTurn, findIdleConversations } from './turn';

const found = (inboundVersion: number, processedVersion: number) =>
  prismaMock.whatsAppConversation.findUnique.mockResolvedValue({
    inboundVersion,
    processedVersion,
  });

describe('claimTurn', () => {
  beforeEach(() => vi.resetAllMocks());

  it('autorise le tour de la dernière version non traitée', async () => {
    found(3, 2);
    expect(await claimTurn('c1', 3)).toBe('ready');
  });

  it('efface un tour dépassé par un message plus récent', async () => {
    found(4, 2);
    expect(await claimTurn('c1', 3)).toBe('stale');
  });

  it('ignore un tour déjà traité (rejeu, balayage)', async () => {
    found(3, 3);
    expect(await claimTurn('c1', 3)).toBe('done');
  });

  it('signale une conversation disparue (purge)', async () => {
    prismaMock.whatsAppConversation.findUnique.mockResolvedValue(null);
    expect(await claimTurn('c1', 1)).toBe('missing');
  });
});

describe('completeTurn', () => {
  beforeEach(() => vi.resetAllMocks());

  it('valide seulement si la version reçue est celle du tour', async () => {
    prismaMock.whatsAppConversation.updateMany.mockResolvedValue({ count: 1 });
    expect(await completeTurn('c1', 3)).toBe(true);
    expect(prismaMock.whatsAppConversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', inboundVersion: 3, processedVersion: { lt: 3 } },
      data: { processedVersion: 3 },
    });
  });

  it('refuse quand un message est arrivé pendant le tour', async () => {
    prismaMock.whatsAppConversation.updateMany.mockResolvedValue({ count: 0 });
    expect(await completeTurn('c1', 3)).toBe(false);
  });
});

describe('findIdleConversations', () => {
  it('lit les conversations en attente depuis plus de minAgeMs', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'c1', inboundVersion: 2 }]);
    const rows = await findIdleConversations(
      30_000,
      new Date('2026-11-28T10:00:00Z')
    );
    expect(rows).toEqual([{ id: 'c1', inboundVersion: 2 }]);
    const values = prismaMock.$queryRaw.mock.calls[0][0].values;
    expect(values[0]).toEqual(new Date('2026-11-28T09:59:30Z'));
  });
});
