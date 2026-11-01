// lib/jeko/expiry.test.ts
//
// Expiration OPPORTUNISTE des commandes en attente de paiement (pas de cron : le
// rappel d'inventaire se déclenche déjà au chargement du dashboard, on fait
// pareil). Règles de sécurité :
//   - on interroge Jèko AVANT d'expirer : un paiement réussi est réglé, jamais
//     annulé ;
//   - si Jèko est injoignable, on N'EXPIRE PAS (on réessaiera au prochain passage) ;
//   - l'annulation est gardée sur `isPaid:false` : une commande payée entre-temps
//     n'est pas touchée, et sa fidélité non plus.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/stock-history/record', async () =>
  (await import('@/lib/stock-history/test-mocks')).recordMock()
);
vi.mock('@/lib/stock-history/lifecycle', async () =>
  (await import('@/lib/stock-history/test-mocks')).lifecycleMock()
);
vi.mock('@/lib/stock-history/lock', async () =>
  (await import('@/lib/stock-history/test-mocks')).lockMock()
);

vi.mock('@/lib/prisma', () => ({
  default: { order: { findMany: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock('@/lib/loyalty-mutations', () => ({ revokeLoyaltyForOrder: vi.fn() }));
vi.mock('@/lib/order-mutations', () => ({ releaseUnpaidStockHold: vi.fn() }));
vi.mock('@/lib/credits/spend', () => ({ restoreOrderCredit: vi.fn() }));
vi.mock('./config', () => ({ jekoConfig: vi.fn() }));
vi.mock('./client', async (importActual) => ({
  ...(await importActual<typeof import('./client')>()),
  getJekoPaymentRequest: vi.fn(),
}));
vi.mock('./settle', () => ({ settleJekoTransaction: vi.fn() }));

import prisma from '@/lib/prisma';
import { revokeLoyaltyForOrder } from '@/lib/loyalty-mutations';
import { releaseUnpaidStockHold } from '@/lib/order-mutations';
import { restoreOrderCredit } from '@/lib/credits/spend';
import { jekoConfig } from './config';
import { JekoApiError, getJekoPaymentRequest } from './client';
import { settleJekoTransaction } from './settle';
import { expirePendingOrders } from './expiry';

const findMany = vi.mocked(prisma.order.findMany);
const transaction = vi.mocked(prisma.$transaction);
const revoke = vi.mocked(revokeLoyaltyForOrder);
const release = vi.mocked(releaseUnpaidStockHold);
const config = vi.mocked(jekoConfig);
const getRequest = vi.mocked(getJekoPaymentRequest);
const settle = vi.mocked(settleJekoTransaction);

const updateMany = vi.fn();
const update = vi.fn();

const overdue = {
  id: 'o1',
  customerId: 'c1',
  loyaltyRewardId: 'r1',
  paymentRequestId: 'pr_1',
};

// Chaque test avance l'horloge de 2 min : le garde « 1 passage par minute » est un
// état de module, il ne doit pas masquer les cas suivants.
let tick = 0;
const nextNow = () =>
  new Date(Date.UTC(2026, 9, 3, 12, 0, 0) + 120_000 * tick++);

describe('expirePendingOrders', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    config.mockReturnValue({ apiKey: 'k', apiKeyId: 'i', storeId: 's' });
    findMany.mockResolvedValue([overdue] as never);
    getRequest.mockResolvedValue({ id: 'pr_1', status: 'pending' } as never);
    updateMany.mockResolvedValue({ count: 1 });
    update.mockResolvedValue({});
    transaction.mockImplementation((async (cb: (tx: unknown) => unknown) =>
      cb({ order: { updateMany, update } })) as never);
    revoke.mockResolvedValue(undefined);
    release.mockResolvedValue(undefined);
  });

  it('expire une commande dont Jèko confirme qu’elle est toujours en attente', async () => {
    const result = await expirePendingOrders(nextNow());

    expect(result).toEqual({ expired: 1, settled: 0, skipped: 0 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'o1',
        isPaid: false,
        status: 'NEW',
        paymentExpiresAt: { not: null },
      },
      data: { status: 'CANCELLED' },
    });
  });

  it('rend à son client l’avoir retenu pour ce paiement jamais arrivé', async () => {
    await expirePendingOrders(nextNow());
    expect(restoreOrderCredit).toHaveBeenCalledWith(expect.anything(), 'o1');
  });

  it('défait la fidélité et restitue la récompense utilisée (annulation système)', async () => {
    await expirePendingOrders(nextNow());

    expect(revoke).toHaveBeenCalledTimes(1);
    const args = revoke.mock.calls[0][1];
    expect(args).toMatchObject({
      orderId: 'o1',
      customerId: 'c1',
      usedRewardId: 'r1',
    });
    // `keepUsedReward` est réservé à l'annulation par le staff : ici le client
    // récupère sa récompense.
    expect(args.keepUsedReward).toBeFalsy();
  });

  it('interroge Jèko avec les clés du compte de la commande, pas celles du compte actif', async () => {
    findMany.mockResolvedValue([{ ...overdue, jekoAccount: 'B' }] as never);
    getRequest.mockResolvedValue({ id: 'pr_1', status: 'pending' } as never);

    await expirePendingOrders(nextNow());

    expect(config).toHaveBeenCalledWith('B');
  });

  it('expire aussi quand Jèko répond une erreur de paiement', async () => {
    getRequest.mockResolvedValue({ id: 'pr_1', status: 'error' } as never);
    await expect(expirePendingOrders(nextNow())).resolves.toMatchObject({
      expired: 1,
    });
  });

  it('règle au lieu d’expirer quand Jèko confirme un paiement réussi', async () => {
    getRequest.mockResolvedValue({
      id: 'pr_1',
      status: 'success',
      reference: 'EBA-20261003-AB12-1',
      paymentMethod: 'wave',
      transactionId: 'txn_1',
      amountFcfa: 3485,
      gatewayFeeFcfa: 52.28,
    } as never);
    settle.mockResolvedValue('paid');

    const result = await expirePendingOrders(nextNow());

    expect(result).toEqual({ expired: 0, settled: 1, skipped: 0 });
    expect(settle).toHaveBeenCalledWith(
      {
        transactionId: 'txn_1',
        status: 'success',
        amountFcfa: 3485,
        gatewayFeeFcfa: 52.28,
        paymentMethod: 'wave',
        reference: 'EBA-20261003-AB12-1',
        paymentRequestId: 'pr_1',
      },
      'A'
    );
    expect(updateMany).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("n'expire pas quand Jèko est injoignable : il réessaiera au prochain passage", async () => {
    getRequest.mockRejectedValue(new Error('Jèko indisponible'));

    const result = await expirePendingOrders(nextNow());

    expect(result).toEqual({ expired: 0, settled: 0, skipped: 1 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('expire quand Jèko ne connaît pas la demande (404) au lieu de réessayer à chaque passage', async () => {
    getRequest.mockRejectedValue(
      new JekoApiError(404, 'not_found', 'Demande introuvable')
    );

    const result = await expirePendingOrders(nextNow());

    expect(result).toEqual({ expired: 1, settled: 0, skipped: 0 });
  });

  it("n'expire pas un succès dont Jèko ne détaille pas la transaction", async () => {
    getRequest.mockResolvedValue({
      id: 'pr_1',
      status: 'success',
      reference: null,
      amountFcfa: null,
    } as never);

    await expect(expirePendingOrders(nextNow())).resolves.toMatchObject({
      expired: 0,
      skipped: 1,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("expire sans interroger Jèko quand la demande n'a jamais été créée", async () => {
    findMany.mockResolvedValue([
      { ...overdue, paymentRequestId: null },
    ] as never);

    await expect(expirePendingOrders(nextNow())).resolves.toMatchObject({
      expired: 1,
    });
    expect(getRequest).not.toHaveBeenCalled();
  });

  it("sans configuration Jèko, n'expire pas une commande qui a une demande de paiement (elle a pu être payée)", async () => {
    config.mockReturnValue(null);

    await expect(expirePendingOrders(nextNow())).resolves.toEqual({
      expired: 0,
      settled: 0,
      skipped: 1,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("ne défait pas la fidélité d'une commande payée entre-temps", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(expirePendingOrders(nextNow())).resolves.toMatchObject({
      expired: 0,
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it("ne touche pas à la fidélité d'une commande sans client", async () => {
    findMany.mockResolvedValue([{ ...overdue, customerId: null }] as never);

    await expect(expirePendingOrders(nextNow())).resolves.toMatchObject({
      expired: 1,
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('ne retient que les commandes en ligne, impayées, dépassées de plus de 2 minutes', async () => {
    const now = nextNow();
    await expirePendingOrders(now);

    const where = findMany.mock.calls[0][0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({
      source: 'ONLINE',
      isPaid: false,
      status: 'NEW',
      onlineFee: { not: null },
    });
    expect(where.paymentExpiresAt).toEqual({
      lt: new Date(now.getTime() - 2 * 60_000),
    });
  });

  it('ne passe qu’une fois par minute', async () => {
    const now = nextNow();
    await expirePendingOrders(now);
    findMany.mockClear();

    const again = await expirePendingOrders(new Date(now.getTime() + 30_000));

    expect(again).toEqual({ expired: 0, settled: 0, skipped: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('continue avec les commandes suivantes quand l’une échoue', async () => {
    findMany.mockResolvedValue([
      overdue,
      { ...overdue, id: 'o2', paymentRequestId: 'pr_2' },
    ] as never);
    getRequest
      .mockRejectedValueOnce(new Error('Jèko indisponible'))
      .mockResolvedValueOnce({ id: 'pr_2', status: 'pending' } as never);

    await expect(expirePendingOrders(nextNow())).resolves.toEqual({
      expired: 1,
      settled: 0,
      skipped: 1,
    });
  });

  it('restitue le stock réservé tôt et redescend stockReservedAt à null', async () => {
    const items = [{ productId: 'p1', quantity: 1, supplements: [] }];
    findMany.mockResolvedValue([
      {
        ...overdue,
        items,
        stockReservedAt: new Date('2026-10-03T11:58:00.000Z'),
      },
    ] as never);

    await expirePendingOrders(nextNow());

    expect(release).toHaveBeenCalledWith(expect.anything(), items, overdue.id);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { stockReservedAt: null },
    });
  });

  it("ne touche pas au stock d'une commande qui n'en avait pas réservé (différée, ou créée avant ce chantier)", async () => {
    await expirePendingOrders(nextNow());

    expect(release).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
