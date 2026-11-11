import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {} }));

import { assertLinkedPaymentAllowed } from './payments-queries';

const COST = {
  id: 'c1',
  label: 'Loyer',
  amount: 300000,
  periodicity: 'MONTHLY' as const,
  startDate: new Date(Date.UTC(2026, 0, 5)),
  endDate: null,
  active: true,
  categoryId: 'cat',
  installments: [] as { monthOffset: number; day: number; amount: number }[],
};

/** Faux `Prisma.TransactionClient` minimal : seul ce que lit la fonction. */
function makeDb(opts: { cost?: typeof COST | null; already?: number | null }) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    fixedCost: {
      findUnique: vi
        .fn()
        .mockResolvedValue(opts.cost === undefined ? COST : opts.cost),
    },
    expense: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { amount: opts.already ?? 0 } }),
    },
  };
}

type Db = Parameters<typeof assertLinkedPaymentAllowed>[0];
const asDb = (db: ReturnType<typeof makeDb>) => db as unknown as Db;

describe('assertLinkedPaymentAllowed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepte un cumul qui atteint EXACTEMENT le montant de l’échéance', async () => {
    const db = makeDb({ already: 100000 });
    await expect(
      assertLinkedPaymentAllowed(asDb(db), 'c1', '2026-11-05', 200000)
    ).resolves.toBeUndefined();
  });

  it('refuse un cumul qui dépasse le montant de l’échéance', async () => {
    const db = makeDb({ already: 100000 });
    await expect(
      assertLinkedPaymentAllowed(asDb(db), 'c1', '2026-11-05', 200001)
    ).rejects.toThrow(/dépasserait l’échéance « Loyer »/);
  });

  it('accepte un paiement partiel, puis le solde exact', async () => {
    const partial = makeDb({ already: 0 });
    await expect(
      assertLinkedPaymentAllowed(asDb(partial), 'c1', '2026-11-05', 100000)
    ).resolves.toBeUndefined();

    // Une fois les 100 000 F enregistrés, le solde de 200 000 F passe encore…
    const settle = makeDb({ already: 100000 });
    await expect(
      assertLinkedPaymentAllowed(asDb(settle), 'c1', '2026-11-05', 200000)
    ).resolves.toBeUndefined();

    // …mais un centime de plus est refusé.
    const over = makeDb({ already: 100000 });
    await expect(
      assertLinkedPaymentAllowed(asDb(over), 'c1', '2026-11-05', 200001)
    ).rejects.toThrow(/dépasserait/);
  });

  it('refuse une charge introuvable', async () => {
    const db = makeDb({ cost: null });
    await expect(
      assertLinkedPaymentAllowed(asDb(db), 'absent', '2026-11-05', 1000)
    ).rejects.toThrow(/Charge fixe introuvable/);
  });

  it('refuse une date qui n’est pas une échéance réelle', async () => {
    const db = makeDb({});
    await expect(
      assertLinkedPaymentAllowed(asDb(db), 'c1', '2026-11-06', 1000)
    ).rejects.toThrow(/n’est pas une échéance/);
  });

  it('verrouille la charge (SELECT … FOR UPDATE) avant de lire le cumul', async () => {
    const db = makeDb({ already: 0 });
    await assertLinkedPaymentAllowed(asDb(db), 'c1', '2026-11-05', 1000);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const lockOrder = db.$queryRaw.mock.invocationCallOrder[0];
    const readOrder = db.expense.aggregate.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(readOrder);
  });
});
