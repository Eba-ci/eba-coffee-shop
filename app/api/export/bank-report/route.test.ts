import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentSession: vi.fn(),
  ROLE_GROUPS: { STATS: ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'] },
}));
vi.mock('@/lib/stats', () => ({
  getRangeStats: vi.fn(),
  getDailySeries: vi.fn(),
  getTopProducts: vi.fn(),
}));
vi.mock('@/lib/stats-compare', () => ({ previousRange: vi.fn() }));
vi.mock('@/lib/expenses', () => ({ getExpenseSummary: vi.fn() }));
vi.mock('@/lib/investments', () => ({ getInvestmentSummary: vi.fn() }));
vi.mock('@/lib/stats-customers', () => ({ getCustomerRangeStats: vi.fn() }));
vi.mock('@/lib/revenue-adjustments', () => ({
  getRevenueAdjustmentSummary: vi.fn(),
}));
vi.mock('@/lib/stats-excel', () => ({ buildBankReportWorkbook: vi.fn() }));
vi.mock('@/lib/excel', () => ({ xlsxResponse: vi.fn() }));

import { getCurrentSession } from '@/lib/auth-helpers';
import { getExpenseSummary } from '@/lib/expenses';
import { xlsxResponse } from '@/lib/excel';
import { previousRange } from '@/lib/stats-compare';
import { buildBankReportWorkbook } from '@/lib/stats-excel';
import { GET } from './route';

const req = (search = '') =>
  new NextRequest(`http://localhost/api/export/bank-report${search}`);

function session(role: string) {
  vi.mocked(getCurrentSession).mockResolvedValue({ user: { role } } as never);
}

describe('rapport bancaire — dépenses avec détail salaires réservé à l’ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getExpenseSummary).mockResolvedValue({
      total: 0,
      fixed: 0,
      variable: 0,
      byCategory: [],
    } as never);
    vi.mocked(previousRange).mockReturnValue({
      from: new Date('2026-05-01'),
      to: new Date('2026-05-31'),
    });
    vi.mocked(buildBankReportWorkbook).mockReturnValue(
      Buffer.from('') as never
    );
    vi.mocked(xlsxResponse).mockReturnValue(new Response('x'));
  });

  it('refuse (403) un rôle hors stats', async () => {
    session('CASHIER');
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(getExpenseSummary).not.toHaveBeenCalled();
  });

  it.each(['MANAGER', 'COMPTABLE'])(
    'passe includeSalary=false pour %s',
    async (role) => {
      session(role);
      await GET(req('?from=2026-06-01&to=2026-06-30'));
      expect(getExpenseSummary).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        expect.objectContaining({ includeSalary: false })
      );
    }
  );

  it('passe includeSalary=true pour l’ADMIN', async () => {
    session('ADMIN');
    await GET(req('?from=2026-06-01&to=2026-06-30'));
    expect(getExpenseSummary).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      expect.objectContaining({ includeSalary: true })
    );
  });
});
