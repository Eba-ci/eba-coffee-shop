// lib/loyalty-reward-use.test.ts
//
// Helpers d'utilisation d'une récompense fidélité, partagés entre la caisse
// (createCashierOrder) et le checkout en ligne (createOrder). Ils prennent un
// client de transaction Prisma en paramètre : on le simule ici.

import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import {
  consumeLoyaltyReward,
  LoyaltyRewardUnavailableError,
  resolveLoyaltyReward,
} from './loyalty-mutations';

type RewardRow = {
  id: string;
  customerId: string;
  capAmount: number;
  status: string;
};

function makeTx(
  reward: RewardRow | null,
  opts: { programEnabled?: boolean; loyaltyDisabled?: boolean } = {}
) {
  const { programEnabled = true, loyaltyDisabled = false } = opts;
  const tx = {
    // Fidélité gelée = programme coupé (réglages) OU client désactivé.
    loyaltySettings: {
      findUnique: vi.fn().mockResolvedValue({ enabled: programEnabled }),
    },
    customer: {
      findUnique: vi.fn().mockResolvedValue({ loyaltyDisabled }),
    },
    loyaltyReward: {
      findUnique: vi.fn().mockResolvedValue(reward),
      update: vi.fn().mockResolvedValue(undefined),
    },
    loyaltyLedger: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
  return tx as unknown as Prisma.TransactionClient & typeof tx;
}

const AVAILABLE: RewardRow = {
  id: 'reward-1',
  customerId: 'cust-1',
  capAmount: 1000,
  status: 'AVAILABLE',
};

describe('resolveLoyaltyReward', () => {
  it('retourne la récompense quand elle appartient au client et est AVAILABLE', async () => {
    const tx = makeTx(AVAILABLE);
    await expect(
      resolveLoyaltyReward(tx, 'reward-1', 'cust-1')
    ).resolves.toEqual({ id: 'reward-1', capAmount: 1000 });
  });

  it('refuse sans client résolu (commande anonyme)', async () => {
    const tx = makeTx(AVAILABLE);
    await expect(
      resolveLoyaltyReward(tx, 'reward-1', null)
    ).rejects.toBeInstanceOf(LoyaltyRewardUnavailableError);
    expect(tx.loyaltyReward.findUnique).not.toHaveBeenCalled();
  });

  it('refuse une récompense introuvable', async () => {
    const tx = makeTx(null);
    await expect(
      resolveLoyaltyReward(tx, 'reward-1', 'cust-1')
    ).rejects.toBeInstanceOf(LoyaltyRewardUnavailableError);
  });

  it('refuse la récompense d’un autre client', async () => {
    const tx = makeTx({ ...AVAILABLE, customerId: 'cust-2' });
    await expect(
      resolveLoyaltyReward(tx, 'reward-1', 'cust-1')
    ).rejects.toBeInstanceOf(LoyaltyRewardUnavailableError);
  });

  it('refuse une récompense déjà utilisée', async () => {
    const tx = makeTx({ ...AVAILABLE, status: 'USED' });
    await expect(
      resolveLoyaltyReward(tx, 'reward-1', 'cust-1')
    ).rejects.toBeInstanceOf(LoyaltyRewardUnavailableError);
  });

  it('refuse une récompense acquise quand le programme est désactivé (gel)', async () => {
    const tx = makeTx(AVAILABLE, { programEnabled: false });
    await expect(
      resolveLoyaltyReward(tx, 'reward-1', 'cust-1')
    ).rejects.toBeInstanceOf(LoyaltyRewardUnavailableError);
    expect(tx.loyaltyReward.findUnique).not.toHaveBeenCalled();
  });

  it('refuse une récompense acquise quand la fidélité du client est désactivée (gel)', async () => {
    const tx = makeTx(AVAILABLE, { loyaltyDisabled: true });
    await expect(
      resolveLoyaltyReward(tx, 'reward-1', 'cust-1')
    ).rejects.toBeInstanceOf(LoyaltyRewardUnavailableError);
    // La récompense n'est ni lue ni consommée : elle revient à la réactivation.
    expect(tx.loyaltyReward.update).not.toHaveBeenCalled();
  });
});

describe('consumeLoyaltyReward', () => {
  it('marque USED et trace le ledger', async () => {
    const tx = makeTx(AVAILABLE);
    await consumeLoyaltyReward(tx, {
      rewardId: 'reward-1',
      customerId: 'cust-1',
      orderId: 'order-1',
      capAmount: 1000,
      actorId: null,
    });

    expect(tx.loyaltyReward.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reward-1' },
        data: expect.objectContaining({
          status: 'USED',
          usedOrderId: 'order-1',
        }),
      })
    );
    expect(tx.loyaltyLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'cust-1',
          type: 'REWARD_USED',
          orderId: 'order-1',
          actorId: null,
        }),
      })
    );
  });
});
