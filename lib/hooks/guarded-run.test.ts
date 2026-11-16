import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardedRun } from './guarded-run';

const cbs = () => ({
  timeoutMs: 20_000,
  onTimeout: vi.fn(),
  onOk: vi.fn(),
  onError: vi.fn(),
});

describe('guardedRun', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('succès rapide : onOk, pas de message de délai', async () => {
    const c = cbs();
    await guardedRun(async () => ({ ok: true as const }), c);
    vi.advanceTimersByTime(60_000);
    expect(c.onOk).toHaveBeenCalledOnce();
    expect(c.onTimeout).not.toHaveBeenCalled();
  });

  it("refus métier : l'erreur du serveur est relayée", async () => {
    const c = cbs();
    await guardedRun(async () => ({ ok: false as const, error: 'Non' }), c);
    expect(c.onError).toHaveBeenCalledWith('Non');
  });

  it('exception : message générique, pas de crash', async () => {
    const c = cbs();
    await guardedRun(async () => {
      throw new Error('réseau');
    }, c);
    expect(c.onError).toHaveBeenCalledOnce();
  });

  it("délai dépassé : signale sans relancer l'action, puis finit normalement", async () => {
    const c = cbs();
    const fn = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) =>
          setTimeout(() => resolve({ ok: true }), 30_000)
        )
    );
    const p = guardedRun(fn, c);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(c.onTimeout).toHaveBeenCalledOnce();
    expect(c.onOk).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(fn).toHaveBeenCalledOnce();
    expect(c.onOk).toHaveBeenCalledOnce();
  });
});
