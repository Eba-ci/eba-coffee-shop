import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { logStockAnomaly, logStockChange, logStockSet } from './record';
import { runWithStockContext } from './source-context';

function makeTx(
  product: { name: string; stockQuantity: number | null } | null,
  option?: {
    name: string;
    stockQuantity: number | null;
    group: { name: string; product: { name: string } | null };
  }
) {
  const create = vi.fn();
  const tx = {
    product: { findUnique: vi.fn().mockResolvedValue(product) },
    supplementOption: { findUnique: vi.fn().mockResolvedValue(option ?? null) },
    stockMovement: { create },
  } as unknown as Prisma.TransactionClient;
  return { tx, create };
}

describe('logStockChange', () => {
  it('déduit before de after − delta et fige le nom', async () => {
    const { tx, create } = makeTx({ name: 'Beignet', stockQuantity: 7 });
    await logStockChange(tx, {
      kind: 'PRODUCT',
      resourceId: 'p1',
      reason: 'ORDER_KITCHEN',
      delta: -3,
      ctx: { orderId: 'o1', actorId: 'u1' },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'PRODUCT',
        resourceId: 'p1',
        label: 'Beignet',
        reason: 'ORDER_KITCHEN',
        delta: -3,
        before: 10,
        after: 7,
        orderId: 'o1',
        actorId: 'u1',
        source: 'STAFF',
      }),
    });
  });

  it('stock illimité : garde delta, before/after à null', async () => {
    const { tx, create } = makeTx({ name: 'Café', stockQuantity: null });
    await logStockChange(tx, {
      kind: 'PRODUCT',
      resourceId: 'p2',
      reason: 'ORDER_KITCHEN',
      delta: -2,
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      delta: -2,
      before: null,
      after: null,
    });
  });

  it('libellé d’une option : produit · groupe · option', async () => {
    const { tx, create } = makeTx(null, {
      name: 'Chocolat',
      stockQuantity: 4,
      group: { name: 'Goûts', product: { name: 'Crêpe' } },
    });
    await logStockChange(tx, {
      kind: 'OPTION',
      resourceId: 'o1',
      reason: 'HOLD_RESERVE',
      delta: -1,
    });
    expect(create.mock.calls[0][0].data.label).toBe('Crêpe · Goûts · Chocolat');
  });

  it('option d’un groupe global : sans nom de produit', async () => {
    const { tx, create } = makeTx(null, {
      name: 'Chantilly',
      stockQuantity: 9,
      group: { name: 'Extras', product: null },
    });
    await logStockChange(tx, {
      kind: 'OPTION',
      resourceId: 'o2',
      reason: 'ORDER_KITCHEN',
      delta: -1,
    });
    expect(create.mock.calls[0][0].data.label).toBe('Extras · Chantilly');
  });

  it('cible disparue : l’id sert de libellé', async () => {
    const { tx, create } = makeTx(null);
    await logStockChange(tx, {
      kind: 'PRODUCT',
      resourceId: 'gone',
      reason: 'HOLD_RELEASE',
      delta: 2,
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      label: 'gone',
      before: null,
      after: null,
    });
  });

  it('delta nul : rien n’est écrit', async () => {
    const { tx, create } = makeTx({ name: 'X', stockQuantity: 1 });
    await logStockChange(tx, {
      kind: 'PRODUCT',
      resourceId: 'p',
      reason: 'ORDER_KITCHEN',
      delta: 0,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('la source ambiante (MCP) s’applique quand le mouvement n’en précise pas', async () => {
    const { tx, create } = makeTx({ name: 'X', stockQuantity: 5 });
    await runWithStockContext({ source: 'MCP', actorId: 'u9' }, () =>
      logStockChange(tx, {
        kind: 'PRODUCT',
        resourceId: 'p',
        reason: 'MANUAL_RESTOCK',
        delta: 5,
      })
    );
    expect(create.mock.calls[0][0].data).toMatchObject({
      source: 'MCP',
      actorId: 'u9',
    });
  });

  it('une source explicite l’emporte sur la source ambiante', async () => {
    const { tx, create } = makeTx({ name: 'X', stockQuantity: 5 });
    await runWithStockContext({ source: 'MCP' }, () =>
      logStockChange(tx, {
        kind: 'PRODUCT',
        resourceId: 'p',
        reason: 'HOLD_RESERVE',
        delta: -1,
        ctx: { source: 'SYSTEM' },
      })
    );
    expect(create.mock.calls[0][0].data.source).toBe('SYSTEM');
  });
});

describe('logStockSet', () => {
  it('calcule delta = after − before', async () => {
    const { tx, create } = makeTx({ name: 'Beignet', stockQuantity: 12 });
    await logStockSet(tx, {
      kind: 'PRODUCT',
      resourceId: 'p1',
      reason: 'MANUAL_SET',
      before: 4,
      after: 12,
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      delta: 8,
      before: 4,
      after: 12,
      label: 'Beignet',
    });
  });

  it('valeur inchangée : rien n’est écrit', async () => {
    const { tx, create } = makeTx({ name: 'X', stockQuantity: 4 });
    await logStockSet(tx, {
      kind: 'PRODUCT',
      resourceId: 'p',
      reason: 'FORM_EDIT',
      before: 4,
      after: 4,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('passage à illimité : delta null', async () => {
    const { tx, create } = makeTx({ name: 'X', stockQuantity: null });
    await logStockSet(tx, {
      kind: 'PRODUCT',
      resourceId: 'p',
      reason: 'MANUAL_SET',
      before: 6,
      after: null,
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      delta: null,
      before: 6,
      after: null,
    });
  });

  it('delta imposé (option supprimée) et libellé fourni sans relecture', async () => {
    const { tx, create } = makeTx(null);
    await logStockSet(tx, {
      kind: 'OPTION',
      resourceId: 'o',
      reason: 'OPTION_REMOVED',
      before: 5,
      after: null,
      delta: -5,
      label: 'Goûts · Menthe',
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      delta: -5,
      label: 'Goûts · Menthe',
    });
  });
});

describe('logStockAnomaly', () => {
  it('écrit une ligne ANOMALY sans variation, avec sa note', async () => {
    const { tx, create } = makeTx(null);
    await logStockAnomaly(tx, {
      kind: 'OPTION',
      resourceId: 'p:g:o',
      label: 'Goûts · Menthe',
      note: 'Stock non rendu',
      ctx: { orderId: 'o1' },
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      reason: 'ANOMALY',
      delta: 0,
      note: 'Stock non rendu',
      orderId: 'o1',
    });
  });
});
