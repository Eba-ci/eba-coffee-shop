import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CategoryHistory } from '@/lib/fixed-costs/history-detection';
import { FixedCostHistory } from './fixed-cost-history';

const row = (overrides: Partial<CategoryHistory> = {}): CategoryHistory => ({
  categoryId: 'loyer',
  categoryName: 'Loyer',
  firstMonth: '2026-03',
  lastMonth: '2026-05',
  months: [
    { month: '2026-03', total: 150_000, count: 1 },
    { month: '2026-04', total: 150_000, count: 1 },
    { month: '2026-05', total: 150_000, count: 1 },
  ],
  gaps: [],
  trailingGaps: ['2026-06', '2026-07', '2026-08', '2026-09'],
  suggestedStartMonth: '2026-03',
  suggestedPeriodicity: 'MONTHLY',
  confidence: 'probable',
  alreadyConverted: false,
  total: 450_000,
  expenseCount: 3,
  ...overrides,
});

describe('FixedCostHistory (écran de détection, lecture seule)', () => {
  it('affiche les totaux réels, les trous et la proposition', () => {
    const html = renderToStaticMarkup(
      <FixedCostHistory
        rows={[
          row({
            gaps: ['2026-04'],
            months: [
              { month: '2026-03', total: 150_000, count: 1 },
              { month: '2026-05', total: 160_000, count: 2 },
            ],
            confidence: 'to-review',
          }),
        ]}
      />
    );

    expect(html).toContain('Loyer');
    expect(html).toContain('À vérifier');
    expect(html).toContain('Jamais convertie');
    expect(html).toContain('Trous internes');
    expect(html).toContain('avril 2026');
    expect(html).toContain('Puis plus rien');
    expect(html).toContain('Prise d’effet proposée');
  });

  it('ne propose pas la conversion d’une dépense unique et marque déjà convertie', () => {
    const html = renderToStaticMarkup(
      <FixedCostHistory
        rows={[
          row({
            confidence: 'single',
            alreadyConverted: true,
            months: [{ month: '2026-03', total: 9_000, count: 1 }],
            gaps: [],
            trailingGaps: [],
            lastMonth: '2026-03',
            total: 9_000,
            expenseCount: 1,
          }),
        ]}
      />
    );

    expect(html).toContain('Dépense unique');
    expect(html).toContain('Dépense unique : conversion non proposée.');
    expect(html).toContain('Déjà convertie');
  });

  it('ne contient ni formulaire ni bouton (aucune écriture)', () => {
    const html = renderToStaticMarkup(<FixedCostHistory rows={[row()]} />);

    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
  });

  it('affiche un état vide lisible', () => {
    const html = renderToStaticMarkup(<FixedCostHistory rows={[]} />);
    expect(html).toContain(
      'Aucune catégorie fixe avec des dépenses à détecter.'
    );
  });
});
