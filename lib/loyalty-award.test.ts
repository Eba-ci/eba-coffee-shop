// lib/loyalty-award.test.ts
//
// `awardLoyaltyForOrder` : la règle « 1 tampon / jour » et le verrou de ligne
// qui la rend sûre face aux commandes simultanées.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/lib/daily-numbering', () => ({
  todayDailyDate: () => new Date('2026-10-01T00:00:00.000Z'),
}));

import { awardLoyaltyForOrder } from './loyalty-mutations';

const tx = {
  $queryRaw: vi.fn(),
  customer: { findUnique: vi.fn(), update: vi.fn() },
  loyaltySettings: { findUnique: vi.fn() },
  loyaltyLedger: { create: vi.fn() },
  loyaltyReward: { create: vi.fn() },
};

const args = { customerId: 'c1', orderId: 'o1', orderTotal: 3000 };
const TODAY = new Date('2026-10-01T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  tx.loyaltySettings.findUnique.mockResolvedValue(null); // défauts
});

describe('awardLoyaltyForOrder', () => {
  it('verrouille la ligne client avant de lire lastStampDate', async () => {
    tx.customer.findUnique.mockResolvedValue({
      stampCount: 2,
      lastStampDate: null,
    });
    await awardLoyaltyForOrder(tx as never, args);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // Nom réel de la table (`@@map("customer")`) : « Customer » → 42P01 en base.
    const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('FROM "customer"');
    expect(sql).toContain('FOR UPDATE');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.customer.findUnique.mock.invocationCallOrder[0]
    );
  });

  it('crédite un tampon le premier jour', async () => {
    tx.customer.findUnique.mockResolvedValue({
      stampCount: 2,
      lastStampDate: null,
    });
    await awardLoyaltyForOrder(tx as never, args);

    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { stampCount: 3, lastStampDate: TODAY },
    });
  });

  it('ne crédite pas un 2e tampon le même jour', async () => {
    tx.customer.findUnique.mockResolvedValue({
      stampCount: 3,
      lastStampDate: TODAY,
    });
    const res = await awardLoyaltyForOrder(tx as never, args);

    expect(res.rewards).toEqual([]);
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.loyaltyLedger.create).not.toHaveBeenCalled();
  });

  it('ne crédite rien quand le programme est désactivé (gel global)', async () => {
    tx.loyaltySettings.findUnique.mockResolvedValue({ enabled: false });
    const res = await awardLoyaltyForOrder(tx as never, args);

    expect(res).toEqual({ rewards: [] });
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.loyaltyLedger.create).not.toHaveBeenCalled();
  });

  it('ne crédite rien pour un client dont la fidélité est désactivée (gel client)', async () => {
    tx.customer.findUnique.mockResolvedValue({
      stampCount: 4, // au bord du palier : sans gel, ce tampon débloquerait une récompense
      lastStampDate: null,
      loyaltyDisabled: true,
    });
    const res = await awardLoyaltyForOrder(tx as never, args);

    expect(res).toEqual({ rewards: [] });
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.loyaltyLedger.create).not.toHaveBeenCalled();
    expect(tx.loyaltyReward.create).not.toHaveBeenCalled();
  });
});
