import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildHistoryGrid } from '@/lib/fixed-costs/history-grid';
import { occurrencesInRange } from '@/lib/fixed-costs/schedule';
import { HistoryGridView } from './history-grid-view';

const cost = {
  id: 'c1',
  label: 'Loyer',
  amount: 100_000,
  periodicity: 'MONTHLY' as const,
  startDate: '2026-03-05',
  endDate: null,
  active: true,
  categoryId: 'cat',
  installments: [],
};
const months = ['2026-03', '2026-04', '2026-05'];
const grid = (payments = [] as never[]) =>
  buildHistoryGrid(
    [
      {
        id: 'c1',
        label: 'Loyer',
        inactive: false,
        startDate: cost.startDate,
        endDate: null,
      },
    ],
    occurrencesInRange(
      cost,
      '2026-03-01',
      '2026-05-31',
      payments,
      '2026-11-15'
    ),
    months,
    '2026-11'
  );

describe('HistoryGridView', () => {
  it('affiche états, compteur d’impayés et totaux, avec un lien vers le rapprochement', () => {
    const html = renderToStaticMarkup(<HistoryGridView grid={grid()} />);
    expect(html).toContain('Loyer');
    expect(html).toContain('Impayé');
    expect(html).toContain('3 impayés');
    expect(html).toContain('Total de la période');
    expect(html).toContain('tab=paiements&amp;mois=2026-04#rapprochement');
  });

  it('état vide lisible', () => {
    const html = renderToStaticMarkup(
      <HistoryGridView grid={buildHistoryGrid([], [], months, '2026-11')} />
    );
    expect(html).toContain('Aucune charge à afficher');
  });
});
