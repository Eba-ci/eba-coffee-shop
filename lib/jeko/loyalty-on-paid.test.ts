import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  order: vi.fn(),
  ledger: vi.fn(),
  award: vi.fn(),
  restore: vi.fn(),
  alert: vi.fn(),
}));
vi.mock('./settle-alerts', () => ({ alertStaff: m.alert }));
vi.mock('@/lib/prisma', () => ({
  default: {
    order: { findUnique: m.order },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ loyaltyLedger: { findFirst: m.ledger } }),
  },
}));
vi.mock('@/lib/loyalty-mutations', () => ({
  awardLoyaltyForOrder: m.award,
  restoreLoyaltyForOrder: m.restore,
}));

import { awardLoyaltyOnPayment } from './loyalty-on-paid';

describe('awardLoyaltyOnPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.order.mockResolvedValue({
      customerId: 'c1',
      total: 3000,
      dailyNumber: 7,
    });
    m.ledger.mockResolvedValue(null);
  });

  it('accorde le tampon au paiement', async () => {
    await awardLoyaltyOnPayment('o1');
    expect(m.award).toHaveBeenCalledWith(expect.anything(), {
      customerId: 'c1',
      orderId: 'o1',
      orderTotal: 3000,
      actorId: null,
    });
    expect(m.restore).not.toHaveBeenCalled();
  });

  it('rétablit le tampon existant au lieu d’en créer un second', async () => {
    m.ledger.mockResolvedValue({ id: 'l1' });
    await awardLoyaltyOnPayment('o1');
    expect(m.restore).toHaveBeenCalled();
    expect(m.award).not.toHaveBeenCalled();
  });

  it('ne fait rien sans client', async () => {
    m.order.mockResolvedValue({ customerId: null, total: 3000 });
    await awardLoyaltyOnPayment('o1');
    expect(m.award).not.toHaveBeenCalled();
  });

  it('n’échoue jamais', async () => {
    m.award.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(awardLoyaltyOnPayment('o1')).resolves.toBeUndefined();
    expect(m.alert).toHaveBeenCalledWith(
      'o1',
      7,
      expect.stringContaining('tampon')
    );
  });
});
