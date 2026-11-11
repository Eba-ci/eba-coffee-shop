import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// La page Statistiques assemble de nombreux Server Components ; on les
// remplace par des stubs pour isoler la décision « détail salaires » et ne
// déclencher aucune requête.
vi.mock('@/lib/auth-helpers', () => ({ requireStats: vi.fn() }));
vi.mock('@/lib/stats-compare', () => ({ previousRange: vi.fn() }));
vi.mock('@/lib/stats', () => ({ getEarliestOrderDate: vi.fn() }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/(dashboard)/date-range-filter', () => ({
  DateRangeFilter: () => null,
}));
vi.mock('@/components/(dashboard)/skeletons', () => ({
  KpiGridSkeleton: () => null,
  ChartCardSkeleton: () => null,
}));
vi.mock('./_components/kpi-section', () => ({ KpiSection: vi.fn(() => null) }));
vi.mock('./_components/revenue-trend-section', () => ({
  RevenueTrendSection: () => null,
}));
vi.mock('./_components/peak-hours-section', () => ({
  PeakHoursSection: () => null,
}));
vi.mock('./_components/breakdowns-section', () => ({
  BreakdownsSection: vi.fn(() => null),
}));
vi.mock('./_components/kitchen-section', () => ({
  KitchenSection: () => null,
}));
vi.mock('./_components/customers-section', () => ({
  CustomersSection: () => null,
}));
vi.mock('./_components/investments-section', () => ({
  InvestmentsSection: () => null,
}));
vi.mock('./_components/refunds-section', () => ({
  RefundsSection: () => null,
}));

import { requireStats } from '@/lib/auth-helpers';
import { previousRange } from '@/lib/stats-compare';
import { BreakdownsSection } from './_components/breakdowns-section';
import { KpiSection } from './_components/kpi-section';
import StatistiquesPage from './page';

function propsOf(component: unknown): Record<string, unknown> {
  const calls = (component as unknown as Mock).mock.calls;
  return calls.at(-1)?.[0] as Record<string, unknown>;
}

async function renderPage(role: string) {
  vi.mocked(requireStats).mockResolvedValue({
    user: { id: 'u1', role },
  } as never);
  vi.mocked(previousRange).mockReturnValue({
    from: new Date('2026-05-01'),
    to: new Date('2026-05-31'),
  });
  const tree = await StatistiquesPage({
    searchParams: Promise.resolve({ from: '2026-06-01', to: '2026-06-30' }),
  });
  renderToStaticMarkup(tree);
}

describe('page Statistiques — détail salaires réservé à l’ADMIN', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['MANAGER', 'COMPTABLE', 'ANALYSTE'])(
    'passe includeSalary=false à KPI et Répartition pour %s',
    async (role) => {
      await renderPage(role);
      expect(propsOf(KpiSection).includeSalary).toBe(false);
      expect(propsOf(BreakdownsSection).includeSalary).toBe(false);
    }
  );

  it('passe includeSalary=true pour un ADMIN', async () => {
    await renderPage('ADMIN');
    expect(propsOf(KpiSection).includeSalary).toBe(true);
    expect(propsOf(BreakdownsSection).includeSalary).toBe(true);
  });
});
