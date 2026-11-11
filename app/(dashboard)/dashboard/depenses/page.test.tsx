import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// La page Dépenses assemble de nombreux Server Components ; on les remplace par
// des stubs pour isoler la décision « onglet Salaires » et ne déclencher aucune
// requête.
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
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
vi.mock('./_components/recurring-alert-section', () => ({
  RecurringAlertSection: () => null,
}));
vi.mock('./_components/apercu-section', () => ({ ApercuSection: () => null }));
vi.mock('./_components/historique-section', () => ({
  HistoriqueSection: () => null,
}));
vi.mock('./_components/articles-section', () => ({
  ArticlesSection: () => null,
}));
vi.mock('./_components/recurrentes-section', () => ({
  RecurrentesSection: () => null,
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
vi.mock('./_components/salaires/salaires-section', () => ({
  SalairesSection: () => null,
}));
vi.mock('./depenses-tabs', () => ({ DepensesTabs: vi.fn(() => null) }));

import { requireRoleOrAnalyst } from '@/lib/auth-helpers';
import { DepensesTabs } from './depenses-tabs';
import DepensesPage from './page';

function asRecord(node: unknown): Record<string, unknown> | null {
  return React.isValidElement(node)
    ? (node.props as Record<string, unknown>)
    : null;
}

async function renderPage(role: string) {
  vi.mocked(requireRoleOrAnalyst).mockResolvedValue({
    user: { id: 'u1', role },
  } as never);
  const tree = await DepensesPage({
    searchParams: Promise.resolve({}),
  });
  renderToStaticMarkup(tree);
  const props = (DepensesTabs as unknown as Mock).mock.calls.at(
    -1
  )?.[0] as Record<string, unknown>;
  return props;
}

describe('page Dépenses — onglet Salaires réservé à l’ADMIN', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['MANAGER', 'COMPTABLE', 'ANALYSTE'])(
    'ne construit PAS SalairesSection pour %s et ne lève pas',
    async (role) => {
      const props = await renderPage(role);
      expect(props.showSalaires).toBe(false);
      // Rien à sérialiser côté RSC : la section n'est même pas un élément.
      expect(props.salaires).toBeNull();
      expect(asRecord(props.salaires)).toBeNull();
    }
  );

  it('construit SalairesSection (sous Suspense) pour un ADMIN', async () => {
    const props = await renderPage('ADMIN');
    expect(props.showSalaires).toBe(true);
    // `salaires` = <Suspense><SalairesSection/></Suspense>
    const suspenseProps = asRecord(props.salaires);
    expect(suspenseProps).not.toBeNull();
    const child = React.Children.toArray(
      (suspenseProps as { children: React.ReactNode }).children
    )[0];
    expect(React.isValidElement(child)).toBe(true);
  });
});
