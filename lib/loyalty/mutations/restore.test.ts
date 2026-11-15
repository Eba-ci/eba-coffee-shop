import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ledger: vi.fn(),
  order: vi.fn(),
  award: vi.fn(),
}));
vi.mock('./award', () => ({ awardLoyaltyForOrder: m.award }));

import { restoreLoyaltyForOrder } from './revoke';

const tx = {
  loyaltyLedger: { findMany: m.ledger },
  order: { findUnique: m.order },
} as never;
const args = { orderId: 'o1', customerId: 'c1', orderTotal: 3000 };

describe('restoreLoyaltyForOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.award.mockResolvedValue({ rewards: [] });
  });

  it('rétablit un tampon révoqué', async () => {
    m.ledger.mockResolvedValue([
      { type: 'STAMP_EARNED', stamps: 1 },
      { type: 'ADJUSTMENT', stamps: -1 },
    ]);
    await restoreLoyaltyForOrder(tx, args);
    expect(m.award).toHaveBeenCalledTimes(1);
  });

  it('ne fait rien si le tampon est encore compté', async () => {
    m.ledger.mockResolvedValue([{ type: 'STAMP_EARNED', stamps: 1 }]);
    await restoreLoyaltyForOrder(tx, args);
    expect(m.award).not.toHaveBeenCalled();
  });

  it('accorde le tampon d’une commande en ligne payée jamais créditée', async () => {
    m.ledger.mockResolvedValue([]);
    m.order.mockResolvedValue({ isPaid: true, onlineFee: 100 });
    await restoreLoyaltyForOrder(tx, args);
    expect(m.award).toHaveBeenCalledTimes(1);
  });

  it.each([
    { isPaid: false, onlineFee: 100 },
    { isPaid: true, onlineFee: null },
  ])('ne crédite pas %o sans tampon antérieur', async (o) => {
    m.ledger.mockResolvedValue([]);
    m.order.mockResolvedValue(o);
    await restoreLoyaltyForOrder(tx, args);
    expect(m.award).not.toHaveBeenCalled();
  });
});
