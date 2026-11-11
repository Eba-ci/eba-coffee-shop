// lib/data-retention.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const count = (n: number) => vi.fn().mockResolvedValue({ count: n });
const prismaMock = vi.hoisted(() => ({
  order: { updateMany: vi.fn() },
  refund: { updateMany: vi.fn() },
  customer: { findMany: vi.fn() },
  pollVote: { updateMany: vi.fn() },
  pollSuggestion: { updateMany: vi.fn() },
  pushSubscription: { deleteMany: vi.fn() },
  assistantConversation: { deleteMany: vi.fn() },
  session: { deleteMany: vi.fn() },
  verification: { deleteMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('@/lib/customer-privacy', () => ({
  anonymizeCustomer: vi.fn().mockResolvedValue({ alreadyAnonymized: false }),
}));
vi.mock('@/lib/salaries/retention', () => ({
  anonymizeExpiredSalaryData: vi.fn().mockResolvedValue(0),
}));

import { anonymizeExpiredSalaryData } from '@/lib/salaries/retention';
import { purgeExpiredPersonalData } from './data-retention';

describe('purgeExpiredPersonalData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.order.updateMany = count(3);
    prismaMock.refund.updateMany = count(8);
    prismaMock.customer.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    prismaMock.pollVote.updateMany = count(4);
    prismaMock.pollSuggestion.updateMany = count(1);
    prismaMock.pushSubscription.deleteMany = count(5);
    prismaMock.assistantConversation.deleteMany = count(2);
    prismaMock.session.deleteMany = count(6);
    prismaMock.verification.deleteMany = count(7);
    vi.mocked(anonymizeExpiredSalaryData).mockResolvedValue(2);
  });

  it('applique la grille et rapporte chaque étape', async () => {
    const report = await purgeExpiredPersonalData();
    expect(report).toMatchObject({
      ordersAnonymized: 3,
      refundIdentitiesCleared: 8,
      customersAnonymized: 2,
      salaryIdentitiesAnonymized: 2,
      pollVoteMetaCleared: 4,
      assistantConversationsDeleted: 2,
      sessionsDeleted: 6,
    });
  });

  it('anonymise les remboursements terminés, jamais ceux encore en cours', async () => {
    await purgeExpiredPersonalData();
    const where = prismaMock.refund.updateMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['PAID', 'REJECTED', 'CANCELLED'] });
  });

  it('ne touche jamais une commande impayée (dette ouverte)', async () => {
    await purgeExpiredPersonalData();
    const where = prismaMock.order.updateMany.mock.calls[0][0].where;
    expect(where.NOT).toEqual({ isPaid: false, status: { not: 'CANCELLED' } });
  });

  it('continue quand une étape échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    prismaMock.pollVote.updateMany.mockRejectedValue(new Error('boom'));
    const report = await purgeExpiredPersonalData();
    expect(report.pollVoteMetaCleared).toBe('error');
    expect(report.sessionsDeleted).toBe(6);
  });
});
