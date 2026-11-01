import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { getNextDailyNumber } from './daily-numbering';

function makeTx(max: number | null) {
  const calls: string[] = [];
  const tx = {
    $executeRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push(`lock:${strings.join('?')}:${values.join(',')}`);
        return 1;
      }
    ),
    order: {
      aggregate: vi.fn(async () => {
        calls.push('aggregate');
        return { _max: { dailyNumber: max } };
      }),
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

describe('getNextDailyNumber', () => {
  it('prend le verrou du jour AVANT de lire le dernier numéro', async () => {
    const { tx, calls } = makeTx(7);
    expect(await getNextDailyNumber(tx, new Date('2026-11-01T00:00:00Z'))).toBe(
      8
    );
    expect(calls[0]).toContain('pg_advisory_xact_lock');
    expect(calls[1]).toBe('aggregate');
  });

  it('premier numéro du jour : 1', async () => {
    const { tx } = makeTx(null);
    expect(await getNextDailyNumber(tx, new Date('2026-11-01T00:00:00Z'))).toBe(
      1
    );
  });

  it('un verrou différent par jour, le même pour un même jour', async () => {
    const a = makeTx(0),
      b = makeTx(0),
      c = makeTx(0);
    await getNextDailyNumber(a.tx, new Date('2026-11-01T00:00:00Z'));
    await getNextDailyNumber(b.tx, new Date('2026-11-01T00:00:00Z'));
    await getNextDailyNumber(c.tx, new Date('2026-11-02T00:00:00Z'));
    expect(a.calls[0]).toBe(b.calls[0]);
    expect(a.calls[0]).not.toBe(c.calls[0]);
  });
});
