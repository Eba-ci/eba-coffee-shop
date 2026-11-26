import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma/client';

const update = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ default: { customer: { update } } }));

import { setCustomerLoyaltyDisabled } from './customer-loyalty';

beforeEach(() => vi.clearAllMocks());

describe('setCustomerLoyaltyDisabled', () => {
  it('désactive la fidélité sans toucher aux tampons ni aux récompenses', async () => {
    update.mockResolvedValue({ id: 'c1', loyaltyDisabled: true });
    await setCustomerLoyaltyDisabled('c1', true);

    // Seul le drapeau change : rien n'est effacé, tout revient à la réactivation.
    expect(update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { loyaltyDisabled: true },
    });
  });

  it('réactive la fidélité', async () => {
    update.mockResolvedValue({ id: 'c1', loyaltyDisabled: false });
    await setCustomerLoyaltyDisabled('c1', false);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { loyaltyDisabled: false },
    });
  });

  it('traduit un client introuvable en message lisible', async () => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'test',
      })
    );
    await expect(setCustomerLoyaltyDisabled('nope', true)).rejects.toThrow(
      'Client introuvable.'
    );
  });
});
