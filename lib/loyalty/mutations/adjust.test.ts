import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  ledgerCreate: vi.fn(),
  $transaction: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    customer: { findUnique: m.findUnique, update: m.update },
    loyaltyLedger: { create: m.ledgerCreate },
    $transaction: m.$transaction,
  },
}));
vi.mock('@/lib/loyalty-settings-db', () => ({
  getLoyaltySettings: m.getSettings,
}));

import { adjustStamps, awardMissedOrderStamps } from './adjust';

const SETTINGS = {
  enabled: true,
  minOrderAmount: 1000,
  stampsPerCard: 10,
  tier1Stamps: 5,
  tier1RewardCap: 1000,
  tier2RewardCap: 2500,
  oneStampPerDay: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getSettings.mockResolvedValue(SETTINGS);
  m.$transaction.mockResolvedValue([]);
});

describe('corrections manuelles de tampons sous gel', () => {
  it('adjustStamps est refusé pour un client dont la fidélité est désactivée', async () => {
    m.findUnique.mockResolvedValue({ stampCount: 3, loyaltyDisabled: true });
    await expect(adjustStamps('c1', 1)).rejects.toThrow(/ce client/);
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it('adjustStamps est refusé quand le programme est désactivé', async () => {
    m.getSettings.mockResolvedValue({ ...SETTINGS, enabled: false });
    m.findUnique.mockResolvedValue({ stampCount: 3, loyaltyDisabled: false });
    await expect(adjustStamps('c1', 1)).rejects.toThrow(/toute l’application/);
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it('awardMissedOrderStamps est refusé sous gel (il créerait des récompenses)', async () => {
    m.findUnique.mockResolvedValue({ stampCount: 4, loyaltyDisabled: true });
    await expect(awardMissedOrderStamps('c1', 2)).rejects.toThrow(/ce client/);
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it('adjustStamps reste possible quand la fidélité est active', async () => {
    m.findUnique.mockResolvedValue({ stampCount: 3, loyaltyDisabled: false });
    await expect(adjustStamps('c1', 2)).resolves.toBe(5);
    expect(m.$transaction).toHaveBeenCalledTimes(1);
  });
});
