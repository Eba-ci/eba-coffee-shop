// lib/loyalty-revoke.test.ts
//
// `revokeLoyaltyForOrder` : annuler une commande défait ce qu'elle a produit
// côté fidélité (tampon, récompenses débloquées, récompense utilisée), sans
// jamais reprendre une récompense déjà consommée ailleurs.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/lib/daily-numbering', () => ({
  todayDailyDate: () => new Date('2026-09-25T00:00:00.000Z'),
}));

import {
  restoreLoyaltyForOrder,
  revokeLoyaltyForOrder,
} from './loyalty-mutations';

const tx = {
  $queryRaw: vi.fn(),
  loyaltyReward: { findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  loyaltyLedger: { findMany: vi.fn(), create: vi.fn() },
  customer: { findUnique: vi.fn(), update: vi.fn() },
  loyaltySettings: { findUnique: vi.fn() },
  order: { findUnique: vi.fn() },
};

const args = {
  orderId: 'o1',
  customerId: 'c1',
  usedRewardId: null as string | null,
  note: 'Commande annulée par le client',
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.loyaltyReward.findMany.mockResolvedValue([]);
  tx.loyaltyLedger.findMany.mockResolvedValue([]);
  tx.loyaltySettings.findUnique.mockResolvedValue(null);
  tx.order.findUnique.mockResolvedValue({ isPaid: false, onlineFee: null });
});

describe('revokeLoyaltyForOrder', () => {
  it('ne fait rien pour une commande sans effet fidélité', async () => {
    await revokeLoyaltyForOrder(tx as never, args);
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.loyaltyLedger.create).not.toHaveBeenCalled();
  });

  it('retire le tampon du jour et relâche la règle « un par jour »', async () => {
    tx.loyaltyLedger.findMany.mockResolvedValue([
      { type: 'STAMP_EARNED', stamps: 1 },
    ]);
    tx.customer.findUnique.mockResolvedValue({
      stampCount: 4,
      lastStampDate: new Date('2026-09-25T00:00:00.000Z'),
    });

    await revokeLoyaltyForOrder(tx as never, args);

    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { stampCount: 3, lastStampDate: null },
    });
    expect(tx.loyaltyLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'ADJUSTMENT', stamps: -1 }),
    });
  });

  it('restitue la récompense utilisée sur la commande', async () => {
    await revokeLoyaltyForOrder(tx as never, {
      ...args,
      usedRewardId: 'r-old',
    });
    expect(tx.loyaltyReward.update).toHaveBeenCalledWith({
      where: { id: 'r-old' },
      data: expect.objectContaining({ status: 'AVAILABLE', usedOrderId: null }),
    });
  });

  it('supprime les récompenses débloquées par la commande, sauf celles déjà utilisées ailleurs', async () => {
    tx.loyaltyReward.findMany.mockResolvedValue([
      {
        id: 'r-avail',
        status: 'AVAILABLE',
        usedOrderId: null,
        capAmount: 1000,
      },
      { id: 'r-self', status: 'USED', usedOrderId: 'o1', capAmount: 1000 },
      { id: 'r-spent', status: 'USED', usedOrderId: 'o2', capAmount: 2500 },
    ]);

    // La récompense auto-appliquée (débloquée ET utilisée sur o1) est
    // supprimée, pas restituée.
    await revokeLoyaltyForOrder(tx as never, {
      ...args,
      usedRewardId: 'r-self',
    });

    expect(tx.loyaltyReward.delete).toHaveBeenCalledTimes(2);
    expect(tx.loyaltyReward.delete).toHaveBeenCalledWith({
      where: { id: 'r-avail' },
    });
    expect(tx.loyaltyReward.delete).toHaveBeenCalledWith({
      where: { id: 'r-self' },
    });
    expect(tx.loyaltyReward.update).not.toHaveBeenCalled();
  });

  it('ne retire jamais deux fois le même tampon (annuler, rétablir, ré-annuler)', async () => {
    tx.loyaltyLedger.findMany.mockResolvedValue([
      { type: 'STAMP_EARNED', stamps: 1 },
      { type: 'ADJUSTMENT', stamps: -1 },
    ]);
    await revokeLoyaltyForOrder(tx as never, args);
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('annulation par le staff : la récompense appliquée reste sur la commande', async () => {
    tx.loyaltyReward.findMany.mockResolvedValue([
      { id: 'r-self', status: 'USED', usedOrderId: 'o1', capAmount: 1000 },
    ]);
    await revokeLoyaltyForOrder(tx as never, {
      ...args,
      usedRewardId: 'r-self',
      keepUsedReward: true,
    });
    expect(tx.loyaltyReward.delete).not.toHaveBeenCalled();
    expect(tx.loyaltyReward.update).not.toHaveBeenCalled();
  });
});

describe('restoreLoyaltyForOrder', () => {
  const restoreArgs = { orderId: 'o1', customerId: 'c1', orderTotal: 3500 };

  it('ne fait rien si le tampon est toujours compté, ou n’a jamais été gagné', async () => {
    tx.loyaltyLedger.findMany.mockResolvedValueOnce([
      { type: 'STAMP_EARNED', stamps: 1 },
    ]);
    await restoreLoyaltyForOrder(tx as never, restoreArgs);
    tx.loyaltyLedger.findMany.mockResolvedValueOnce([]);
    await restoreLoyaltyForOrder(tx as never, restoreArgs);
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('rend le tampon retiré, selon les règles normales', async () => {
    tx.loyaltyLedger.findMany.mockResolvedValue([
      { type: 'STAMP_EARNED', stamps: 1 },
      { type: 'ADJUSTMENT', stamps: -1 },
    ]);
    tx.customer.findUnique.mockResolvedValue({
      stampCount: 3,
      lastStampDate: null,
    });

    await restoreLoyaltyForOrder(tx as never, restoreArgs);

    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stampCount: 4 }),
      })
    );
    expect(tx.loyaltyLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'STAMP_EARNED', orderId: 'o1' }),
    });
  });
});
