import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./batch-actions', () => ({ payOccurrencesBatchAction: vi.fn() }));
vi.mock('../../expense-form', () => ({ ExpenseForm: () => null }));

import type { Occurrence } from '@/lib/fixed-costs/schedule';
import { OccurrenceList } from './occurrence-list';
import { initialFromOccurrence } from './pay-drawer';

const occ = (over: Partial<Occurrence>): Occurrence => ({
  costId: 'c1',
  label: 'Loyer',
  categoryId: 'cat',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  dueDate: '2026-11-05',
  amount: 300000,
  paid: 0,
  remaining: 300000,
  status: 'LATE',
  overdue: true,
  expenseIds: [],
  ...over,
});

const render = (props: Partial<React.ComponentProps<typeof OccurrenceList>>) =>
  renderToStaticMarkup(
    React.createElement(OccurrenceList, {
      occurrences: [occ({}), occ({ costId: 'c2', label: 'Wifi' })],
      emptyLabel: 'vide',
      ...props,
    })
  );

describe('initialFromOccurrence', () => {
  it('préremplit le reste à payer, la catégorie et la liaison', () => {
    const v = initialFromOccurrence(occ({ remaining: 120000, paid: 180000 }));
    expect(v).toMatchObject({
      amount: '120000',
      categoryId: 'cat',
      note: 'Loyer',
      fixedCostId: 'c1',
      dueDate: '2026-11-05',
    });
  });
  it('ne rouvre aucun montant pour une échéance soldée', () => {
    expect(initialFromOccurrence(occ({ remaining: 0 })).amount).toBe('');
  });
});

describe('OccurrenceList — sélection', () => {
  it('propose « Sélectionner » quand la liste est sélectionnable', () => {
    expect(render({ selectable: true })).toContain('Sélectionner');
  });
  it('ne le propose pas par défaut ni en lecture seule', () => {
    expect(render({})).not.toContain('Sélectionner');
    expect(render({ selectable: true, readOnly: true })).not.toContain(
      'Sélectionner'
    );
  });
  it('ne le propose pas pour une seule échéance', () => {
    expect(render({ selectable: true, occurrences: [occ({})] })).not.toContain(
      'Sélectionner'
    );
  });
});
