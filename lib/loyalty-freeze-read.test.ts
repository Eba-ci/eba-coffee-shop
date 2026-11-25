// Lecture de la carte de fidélité sous gel (programme ou client désactivé) :
// le drapeau `active` est ce que les consommateurs (checkout, caisse, suivi)
// testent. Rien n'est supprimé : les récompenses restent lisibles en base.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  rewardFindMany: vi.fn(),
  ledgerFindFirst: vi.fn(),
  ledgerCount: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    customer: { findUnique: m.customerFindUnique },
    loyaltyReward: { findMany: m.rewardFindMany },
    loyaltyLedger: { findFirst: m.ledgerFindFirst, count: m.ledgerCount },
  },
}));
vi.mock('@/lib/loyalty-settings-db', () => ({
  getLoyaltySettings: m.getSettings,
}));

import {
  getAvailableRewardForPhone,
  getLoyaltyCard,
  getOrderLoyaltyOutcome,
} from './loyalty';

const REWARD = { id: 'r1', tier: 5, capAmount: 1000, status: 'AVAILABLE' };

function customer(loyaltyDisabled: boolean) {
  return {
    id: 'c1',
    name: 'Kofi',
    phone: '+2250701020304',
    stampCount: 5,
    lastStampDate: null,
    loyaltyDisabled,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getSettings.mockResolvedValue({ enabled: true });
  m.rewardFindMany.mockResolvedValue([REWARD]);
  m.ledgerFindFirst.mockResolvedValue(null);
  m.ledgerCount.mockResolvedValue(0);
});

describe('getLoyaltyCard — gel', () => {
  it('active quand le programme et le client le sont', async () => {
    m.customerFindUnique.mockResolvedValue(customer(false));
    const card = await getLoyaltyCard('c1');
    expect(card).toMatchObject({ active: true, frozenReason: null });
  });

  it('gelée pour un client désactivé, récompenses conservées en lecture', async () => {
    m.customerFindUnique.mockResolvedValue(customer(true));
    const card = await getLoyaltyCard('c1');
    expect(card).toMatchObject({ active: false, frozenReason: 'customer' });
    expect(card?.availableRewards).toHaveLength(1);
    expect(card?.stampCount).toBe(5);
  });

  it('gelée par le programme', async () => {
    m.getSettings.mockResolvedValue({ enabled: false });
    m.customerFindUnique.mockResolvedValue(customer(false));
    const card = await getLoyaltyCard('c1');
    expect(card).toMatchObject({ active: false, frozenReason: 'program' });
  });
});

describe('getAvailableRewardForPhone — gel', () => {
  it('propose la récompense d’un client actif', async () => {
    m.customerFindUnique.mockResolvedValue(customer(false));
    await expect(getAvailableRewardForPhone('0701020304')).resolves.toEqual({
      id: 'r1',
      capAmount: 1000,
    });
  });

  it('ne propose rien à un client dont la fidélité est désactivée', async () => {
    m.customerFindUnique.mockResolvedValue(customer(true));
    await expect(getAvailableRewardForPhone('0701020304')).resolves.toBeNull();
  });
});

describe('getOrderLoyaltyOutcome — gel', () => {
  it('pas de message « tampon » pour un client désactivé', async () => {
    m.customerFindUnique.mockResolvedValue(customer(true));
    m.ledgerFindFirst.mockResolvedValue({ id: 'l1' });
    await expect(getOrderLoyaltyOutcome('c1', 'o1')).resolves.toBeNull();
  });

  it('renvoie l’issue pour un client actif', async () => {
    m.customerFindUnique.mockResolvedValue(customer(false));
    m.ledgerFindFirst.mockResolvedValue({ id: 'l1' });
    m.ledgerCount.mockResolvedValue(1);
    await expect(getOrderLoyaltyOutcome('c1', 'o1')).resolves.toMatchObject({
      stampEarned: true,
      isFirstStampEver: true,
    });
  });
});
