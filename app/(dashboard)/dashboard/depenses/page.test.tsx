import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// La page Dépenses assemble de nombreux Server Components ; on les remplace par
// des stubs pour isoler les décisions de la page (onglet retiré, redirection)
// sans déclencher de requête.
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/lib/auth-helpers', () => ({ requireRoleOrAnalyst: vi.fn() }));
vi.mock('@/lib/expense-settings-db', () => ({
  getExpenseSettings: vi.fn(async () => ({})),
}));
vi.mock('@/components/(dashboard)/date-range-filter', () => ({
  DateRangeFilter: () => null,
}));
vi.mock('@/components/(dashboard)/skeletons', () => ({
  KpiGridSkeleton: () => null,
  ChartCardSkeleton: () => null,
  TableSkeleton: () => null,
}));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./expense-settings-sheet', () => ({
  ExpenseSettingsButton: () => null,
}));
vi.mock('./_components/hide-on-tab', () => ({
  HideOnTab: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./_components/receipt-backfill-alert-section', () => ({
  ReceiptBackfillAlertSection: () => null,
}));
vi.mock('./_components/apercu-section', () => ({ ApercuSection: () => null }));
vi.mock('./_components/historique-section', () => ({
  HistoriqueSection: () => null,
}));
vi.mock('./_components/articles-section', () => ({
  ArticlesSection: () => null,
}));
vi.mock('./_components/point-mort-section', () => ({
  PointMortSection: () => null,
}));
vi.mock('./_components/paiements/payments-section', () => ({
  PaymentsSection: () => null,
}));
vi.mock('./_components/salaires-global-line', () => ({
  SalairesGlobalLine: () => null,
}));
vi.mock('./_components/article-history-section', () => ({
  ArticleHistorySection: () => null,
}));
vi.mock('./depenses-tabs', () => ({ DepensesTabs: vi.fn(() => null) }));

import { redirect } from 'next/navigation';
import { requireRoleOrAnalyst } from '@/lib/auth-helpers';
import { DepensesTabs } from './depenses-tabs';
import DepensesPage from './page';

async function renderPage(role: string, params: Record<string, string> = {}) {
  vi.mocked(requireRoleOrAnalyst).mockResolvedValue({
    user: { id: 'u1', role },
  } as never);
  const tree = await DepensesPage({ searchParams: Promise.resolve(params) });
  renderToStaticMarkup(tree);
  return (DepensesTabs as unknown as Mock).mock.calls.at(-1)?.[0] as Record<
    string,
    unknown
  >;
}

describe('page Dépenses — l’onglet Salaires a été retiré (#450)', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'])(
    'ne transmet plus aucun contenu Salaires pour %s',
    async (role) => {
      const props = await renderPage(role);
      expect(props).not.toHaveProperty('salaires');
      expect(props).not.toHaveProperty('showSalaires');
    }
  );

  it('redirige /dashboard/depenses?tab=salaires vers Employés → Paie du mois', async () => {
    await expect(
      renderPage('ADMIN', { tab: 'salaires', mois: '2026-09' })
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith(
      '/dashboard/employes/paie?mois=2026-09'
    );
  });
});
