import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {} }));
const createExpense = vi.fn();
const getOcc = vi.fn();
vi.mock('@/lib/expenses/mutations/expenses', () => ({
  createExpense: (...a: unknown[]) => createExpense(...a),
}));
vi.mock('@/lib/fixed-costs/payments-queries', () => ({
  getFixedCostOccurrence: (...a: unknown[]) => getOcc(...a),
}));

import { dedupeTargets, lineKey, payOccurrencesBatch } from './batch-payments';

const occ = (remaining: number) => ({
  costId: 'c1',
  label: 'Loyer',
  categoryId: 'cat',
  dueDate: '2026-11-05',
  amount: 300000,
  paid: 300000 - remaining,
  remaining,
});
const opts = { batchKey: 'b1', date: '2026-11-12' };
const t1 = { costId: 'c1', dueDate: '2026-11-05' };
const t2 = { costId: 'c2', dueDate: '2026-11-06' };

describe('payOccurrencesBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dedupes identical targets', () => {
    expect(dedupeTargets([t1, t1, t2])).toEqual([t1, t2]);
  });

  it('creates a linked expense for the remaining amount with a line key', async () => {
    getOcc.mockResolvedValue(occ(120000));
    const res = await payOccurrencesBatch([t1], opts, 'u1');
    expect(res[0]).toMatchObject({ status: 'created', amount: 120000 });
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 120000,
        fixedCostId: 'c1',
        dueDate: '2026-11-05',
        categoryId: 'cat',
      }),
      'u1',
      { idempotencyKey: lineKey('b1', t1) }
    );
  });

  it('skips an already settled occurrence without creating anything', async () => {
    getOcc.mockResolvedValue(occ(0));
    const res = await payOccurrencesBatch([t1], opts, 'u1');
    expect(res[0].status).toBe('skipped');
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('reports partial failures per line and keeps going', async () => {
    getOcc.mockResolvedValue(occ(5000));
    createExpense
      .mockRejectedValueOnce(new Error('Le paiement dépasserait l’échéance'))
      .mockResolvedValueOnce({});
    const res = await payOccurrencesBatch([t1, t2], opts, 'u1');
    expect(res.map((r) => r.status)).toEqual(['failed', 'created']);
    expect(res[0].message).toMatch(/dépasserait/);
  });

  it('treats a race that settled the occurrence as skipped, not failed', async () => {
    getOcc.mockResolvedValueOnce(occ(5000)).mockResolvedValueOnce(occ(0));
    createExpense.mockRejectedValueOnce(new Error('dépasserait'));
    const res = await payOccurrencesBatch([t1], opts, 'u1');
    expect(res[0].status).toBe('skipped');
  });

  it('a replayed batch creates nothing twice', async () => {
    getOcc.mockResolvedValueOnce(occ(5000)).mockResolvedValueOnce(occ(0));
    await payOccurrencesBatch([t1], opts, 'u1');
    const again = await payOccurrencesBatch([t1], opts, 'u1');
    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(again[0].status).toBe('skipped');
  });
});
