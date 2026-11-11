// lib/cash-closing.test.ts
//
// `getCashFigures` : les lignes affichées à la clôture (espèces, Wave, Orange,
// autres) doivent sommer au CA total. Un mode oublié dans le détail ferait
// diverger l'écran du total sans qu'aucune erreur ne le signale.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyModeRecord } from './payment-modes';

vi.mock('@/lib/prisma', () => ({
  default: { expense: { aggregate: vi.fn() } },
}));
vi.mock('@/lib/stats', () => ({ getDailyStats: vi.fn() }));
vi.mock('@/lib/refunds/aggregate', () => ({
  sumCashRefundsForDay: vi.fn().mockResolvedValue(0),
}));

import prisma from '@/lib/prisma';
import { getDailyStats } from '@/lib/stats';
import { sumCashRefundsForDay } from '@/lib/refunds/aggregate';
import { getCashFigures } from './cash-closing';

const date = new Date(Date.UTC(2026, 9, 3));

function stubDay(
  revenueByMode: Partial<Record<string, number>>,
  { refunds = 0, cashRefunds = 0 } = {}
) {
  const byMode = { ...emptyModeRecord(), ...revenueByMode } as Record<
    string,
    number
  >;
  const gross = Object.values(byMode).reduce((a, b) => a + b, 0);
  vi.mocked(getDailyStats).mockResolvedValue({
    revenue: gross - refunds,
    grossRevenue: gross,
    refunds,
    revenueByPaymentMode: byMode,
    grossRevenueByPaymentMode: byMode,
  } as never);
  vi.mocked(sumCashRefundsForDay).mockResolvedValue(cashRefunds);
  vi.mocked(prisma.expense.aggregate).mockResolvedValue({
    _sum: { amount: 0 },
  } as never);
}

describe('getCashFigures', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('range MTN, Moov, Djamo et Autre dans otherSales : le détail somme au total', async () => {
    stubDay({
      CASH: 10000,
      WAVE: 5000,
      ORANGE_MONEY: 3000,
      MTN_MONEY: 1500,
      MOOV_MONEY: 700,
      DJAMO: 2500,
      OTHER: 400,
    });

    const f = await getCashFigures(date);

    expect(f.otherSales).toBe(1500 + 700 + 2500 + 400);
    expect(f.cashSales + f.waveSales + f.orangeMoneySales + f.otherSales).toBe(
      f.totalRevenue
    );
  });

  it('garde les espèces, Wave et Orange à part', async () => {
    stubDay({ CASH: 10000, WAVE: 5000, ORANGE_MONEY: 3000 });

    const f = await getCashFigures(date);

    expect(f.cashSales).toBe(10000);
    expect(f.waveSales).toBe(5000);
    expect(f.orangeMoneySales).toBe(3000);
    expect(f.otherSales).toBe(0);
  });

  it('ventes BRUTES et remboursements espèces à part : le tiroir ne déduit pas deux fois', async () => {
    // Remboursement de 2 000 en espèces sur une vente de 10 000 en espèces.
    stubDay({ CASH: 10000, WAVE: 5000 }, { refunds: 2000, cashRefunds: 2000 });

    const f = await getCashFigures(date);

    expect(f.cashSales).toBe(10000);
    expect(f.cashRefunds).toBe(2000);
    expect(f.totalRevenue).toBe(15000);
    expect(f.refunds).toBe(2000);
  });

  it('compte les espèces rendues même si elles ne touchent pas le CA (commande annulée)', async () => {
    // Aucun remboursement dans le CA, mais 1 500 F sont sortis du tiroir.
    stubDay({ CASH: 10000 }, { refunds: 0, cashRefunds: 1500 });

    const f = await getCashFigures(date);

    expect(f.refunds).toBe(0);
    expect(f.cashRefunds).toBe(1500);
  });

  it('un versement de salaire EN ESPÈCES pèse sur la caisse; la requête ne filtre pas les salaires', async () => {
    stubDay({ CASH: 50_000 });
    // 20 000 F sortis en espèces dont un salaire de 15 000 : la clôture
    // n'exclut PAS les lignes de salaire (elles sont bien des sorties d'espèces).
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({
      _sum: { amount: 20_000 },
    } as never);

    const f = await getCashFigures(date);

    expect(f.cashExpenses).toBe(20_000);
    expect(vi.mocked(prisma.expense.aggregate)).toHaveBeenCalledWith({
      where: { date, paymentMethod: 'CASH' },
      _sum: { amount: true },
    });
  });
});
