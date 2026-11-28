// lib/customer-privacy.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  customer: { findUnique: vi.fn(), update: vi.fn() },
  order: { count: vi.fn(), updateMany: vi.fn() },
  pushSubscription: { deleteMany: vi.fn() },
  refund: { updateMany: vi.fn() },
  pollVote: { updateMany: vi.fn() },
  pollSuggestion: { updateMany: vi.fn() },
  loyaltyReward: { deleteMany: vi.fn() },
  loyaltyLedger: { deleteMany: vi.fn() },
  whatsAppConversation: { deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import {
  CustomerHasCreditError,
  CustomerHasDebtError,
  anonymizeCustomer,
  anonymousPhoneMarker,
} from './customer-privacy';

describe('anonymizeCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'c1',
      phone: '+2250700000000',
      anonymizedAt: null,
      creditBalance: 0,
    });
    prismaMock.order.count.mockResolvedValue(0);
  });

  it('refuse un client qui a une dette ouverte', async () => {
    prismaMock.order.count.mockResolvedValue(2);
    await expect(anonymizeCustomer('c1')).rejects.toBeInstanceOf(
      CustomerHasDebtError
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un client qui a encore un avoir (il serait perdu en silence)', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'c1',
      phone: '+2250700000000',
      anonymizedAt: null,
      creditBalance: 1500,
    });
    await expect(anonymizeCustomer('c1')).rejects.toBeInstanceOf(
      CustomerHasCreditError
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('efface nom, téléphone et note des commandes sans les supprimer', async () => {
    await anonymizeCustomer('c1');
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { customerName: null, customerPhone: null, note: null },
      })
    );
    expect(prismaMock.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: anonymousPhoneMarker('c1'),
          name: null,
          dateOfBirth: null,
        }),
      })
    );
    expect(prismaMock.loyaltyLedger.deleteMany).toHaveBeenCalled();
  });

  it('supprime les conversations WhatsApp rattachées au client (numéro et messages)', async () => {
    await anonymizeCustomer('c1');
    expect(prismaMock.whatsAppConversation.deleteMany).toHaveBeenCalledWith({
      where: { customerId: 'c1' },
    });
  });

  it('efface nom et numéro des remboursements, garde montants, motifs et dates', async () => {
    await anonymizeCustomer('c1');
    const arg = prismaMock.refund.updateMany.mock.calls[0][0];
    expect(arg.data).toEqual({ customerName: null, destinationPhone: null });
    expect(arg.where.OR).toEqual(
      expect.arrayContaining([
        { customerId: 'c1' },
        { destinationPhone: '+2250700000000' },
      ])
    );
  });

  it('est idempotent sur une fiche déjà anonymisée', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'c1',
      phone: 'anon-c1',
      anonymizedAt: new Date(),
    });
    const res = await anonymizeCustomer('c1');
    expect(res.alreadyAnonymized).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
