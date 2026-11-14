// Garde de la Paie du mois (#450) : ADMIN et COMPTABLE lisent, les autres
// rôles sont refusés AVANT toute lecture nominative.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ requirePayroll: vi.fn() }));
vi.mock('@/lib/salaries/admin-queries', () => ({
  getSalaryMonthView: vi.fn(),
}));
vi.mock('../_components/paie/month-nav', () => ({
  SalairesMonthNav: () => null,
}));
vi.mock('../_components/paie/month-view', () => ({
  SalaryMonthView: () => null,
}));
vi.mock('../_components/new-payment-button', () => ({
  NewPaymentButton: () => null,
}));
vi.mock('../_components/page-header', () => ({
  PageHeader: () => null,
}));

import { requirePayroll } from '@/lib/auth-helpers';
import { getSalaryMonthView } from '@/lib/salaries/admin-queries';
import PaiePage from './page';

const view = {
  month: '2026-11',
  employees: [],
  totals: {
    due: 0,
    baseDue: 0,
    primes: 0,
    retenues: 0,
    salariesPaid: 0,
    advancesPaid: 0,
    advanceRecovered: 0,
    remainingToPay: 0,
    overpaid: 0,
    advanceBalance: 0,
    arrearsTotal: 0,
  },
};

const params = { searchParams: Promise.resolve({}) };

beforeEach(() => vi.clearAllMocks());

describe('Paie du mois : garde', () => {
  it('refuse un MANAGER sans appeler la lecture', async () => {
    vi.mocked(requirePayroll).mockRejectedValue(new Error('Non autorisé'));
    await expect(PaiePage(params)).rejects.toThrow('Non autorisé');
    expect(getSalaryMonthView).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'COMPTABLE'])('lit la vue du mois pour %s', async (role) => {
    vi.mocked(requirePayroll).mockResolvedValue({
      user: { id: 'u1', role },
    } as never);
    vi.mocked(getSalaryMonthView).mockResolvedValue(view);
    await expect(PaiePage(params)).resolves.toBeTruthy();
    expect(getSalaryMonthView).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}$/)
    );
  });
});