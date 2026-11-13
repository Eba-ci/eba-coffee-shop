import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../depenses/_components/paiements/batch-actions', () => ({
  payOccurrencesBatchAction: vi.fn(),
}));
vi.mock('../depenses/expense-form', () => ({ ExpenseForm: () => null }));
vi.mock('@/lib/fixed-costs/queries', () => ({
  getPaymentsView: vi.fn(async () => ({
    month: [],
    late: [],
    salaryTotal: 987654,
    week: [],
  })),
}));
vi.mock('@/lib/expenses', () => ({
  listExpenseCategories: vi.fn(async () => []),
}));
vi.mock('../depenses/_components/article-options', () => ({
  loadArticleOptions: vi.fn(async () => []),
}));

import type { Occurrence } from '@/lib/fixed-costs/schedule';
import { buildWeeklyReminder } from '@/lib/fixed-costs/weekly-reminder';
import { WeeklyReminderCard } from './weekly-reminder-card';
import { WeeklyReminderSection } from './weekly-reminder-section';

const occ = (over: Partial<Occurrence>): Occurrence => ({
  costId: 'c1',
  label: 'Loyer',
  categoryId: 'cat',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  dueDate: '2026-11-12',
  amount: 100000,
  paid: 0,
  remaining: 100000,
  status: 'UPCOMING',
  overdue: false,
  expenseIds: [],
  ...over,
});
const html = (week: Occurrence[]) =>
  renderToStaticMarkup(
    <WeeklyReminderCard reminder={buildWeeklyReminder(week, '2026-11-12')} />
  );

describe('WeeklyReminderCard', () => {
  it('affiche période, nombre et total restant', () => {
    const out = html([occ({}), occ({ costId: 'b', label: 'Internet' })]);
    expect(out).toContain('2 échéances');
    expect(out).toContain('Loyer');
    expect(out).toContain('Internet');
    expect(out).toMatch(/200[\s  ]000/);
  });

  it('état vide discret', () => {
    expect(html([])).toContain('Rien à payer cette semaine');
  });
});

describe('WeeklyReminderSection', () => {
  it('ne rend rien pour un rôle non finance', async () => {
    expect(await WeeklyReminderSection({ role: 'CASHIER' })).toBeNull();
  });

  it("n'expose aucun total ni détail de salaire", async () => {
    for (const role of ['MANAGER', 'COMPTABLE', 'ANALYSTE']) {
      const el = await WeeklyReminderSection({ role });
      const out = renderToStaticMarkup(el as React.ReactElement);
      expect(out).not.toMatch(/987|salaire/i);
    }
  });
});
