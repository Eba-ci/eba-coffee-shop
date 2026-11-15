import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
// La navigation de mois vit sur nuqs et l'adaptateur n'est pas monté hors
// navigation réelle : un bouton neutre suffit pour ce test de rendu.
vi.mock('../point-mort/month-nav', () => ({
  MonthNav: () => React.createElement('div', null, 'novembre 2026'),
}));
vi.mock('@/lib/fixed-costs/queries', () => ({
  getPaymentsView: vi.fn(async () => ({ month: [], week: [], late: [] })),
}));
vi.mock('@/lib/fixed-costs/links-queries', () => ({
  getReconciliation: vi.fn(async () => ({
    month: '2026-11',
    occurrences: [],
    unlinked: [],
    linked: [],
    proposals: [],
  })),
}));
vi.mock('@/lib/expenses', () => ({
  listExpenseCategories: vi.fn(async () => []),
}));
vi.mock('../article-options', () => ({
  loadArticleOptions: vi.fn(async () => []),
}));
vi.mock('../../expense-form', () => ({ ExpenseForm: () => null }));

import { PaymentsSection } from './payments-section';

describe('PaymentsSection — aucun champ de saisie dans l’onglet', () => {
  it('ne rend ni input texte, ni select, ni textarea, ni form', async () => {
    const tree = await PaymentsSection({ month: '2026-11' });
    const html = renderToStaticMarkup(tree);
    expect(html).not.toMatch(/<input[^>]*type="(text|number|date|search)"/);
    expect(html).not.toMatch(/<select\b/);
    expect(html).not.toMatch(/<textarea\b/);
    expect(html).not.toMatch(/<form\b/);
  });
});
