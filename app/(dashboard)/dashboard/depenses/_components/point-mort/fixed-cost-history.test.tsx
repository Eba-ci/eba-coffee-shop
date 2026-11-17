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
    expect(html).toContain('Pourquoi « à vérifier » ?');
    expect(html).toContain('Trous internes');
    expect(html).toContain('avril 2026');
    expect(html).toContain('Puis plus rien');
    expect(html).toContain('Proposition :');
    expect(html).toContain('en faire une charge fixe mensuelle');
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
    expect(html).not.toContain('Proposition :');
  });

  it('sans catégories, aucune action d’écriture n’est proposée', () => {
    const html = renderToStaticMarkup(<FixedCostHistory rows={[row()]} />);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');
  });

  it('propose la création depuis l’historique, ou la correction si déjà convertie', () => {
    const cats = [{ id: 'loyer', name: 'Loyer' }];
    const created = renderToStaticMarkup(
      <FixedCostHistory rows={[row()]} categories={cats} />
    );
    expect(created).toContain('Créer la charge depuis l’historique');
    const fixed = renderToStaticMarkup(
      <FixedCostHistory
        rows={[row({ alreadyConverted: true })]}
        categories={cats}
      />
    );
    expect(fixed).toContain('Corriger la prise d’effet');
    expect(fixed).toContain('a déjà une charge fixe');
  });

  it('ne propose rien pour une dépense unique', () => {
    const html = renderToStaticMarkup(
      <FixedCostHistory
        rows={[row({ confidence: 'single' })]}
        categories={[{ id: 'loyer', name: 'Loyer' }]}
      />
    );
    expect(html).not.toContain('depuis l’historique');
  });

  it('affiche un état vide lisible', () => {
    const html = renderToStaticMarkup(<FixedCostHistory rows={[]} />);
    expect(html).toContain(
      'Aucune catégorie fixe avec des dépenses à détecter.'
    );
  });
});
