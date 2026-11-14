import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Le portail Radix ne rend rien côté serveur : on le remplace par des
// conteneurs simples pour tester le contenu du drawer en rendu statique.
vi.mock('@/components/ui/sheet', () => {
  function SheetContent(props: { children?: React.ReactNode; side?: string }) {
    const { children, side, ...rest } = props;
    void side;
    return React.createElement('div', rest, children);
  }
  function SheetHeader(props: { children?: React.ReactNode }) {
    return React.createElement('header', props);
  }
  function SheetTitle(props: { children?: React.ReactNode }) {
    return React.createElement('h2', props);
  }
  function SheetDescription(props: { children?: React.ReactNode }) {
    return React.createElement('p', props);
  }
  function Sheet(props: { children?: React.ReactNode }) {
    return React.createElement(React.Fragment, null, props.children);
  }
  return { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription };
});

// Les actions serveur ne sont jamais appelées dans un rendu statique ; on les
// remplace pour éviter de charger la couche Prisma / auth.
vi.mock('./actions', () => ({
  createFixedCostAction: vi.fn(),
  updateFixedCostAction: vi.fn(),
  deleteFixedCostAction: vi.fn(),
  syncFixedCostsFromCategoriesAction: vi.fn(),
}));

import { draftFromRow, type FixedCostDraftSource } from './fixed-cost-draft';
import { emptyDraft, type Draft } from './fixed-cost-fields';
import {
  FixedCostManager,
  type FixedCostManagerRow,
} from './fixed-cost-manager';
import { FixedCostSheetPanel } from './fixed-cost-sheet';

const categories = [
  { id: 'cat-loyer', name: 'Loyer' },
  { id: 'cat-wifi', name: 'Internet' },
];

const row: FixedCostDraftSource = {
  label: 'Loyer',
  amount: 300000,
  periodicity: 'MONTHLY',
  startDate: '2026-01-05',
  endDate: '2026-12-31',
  categoryId: 'cat-loyer',
  note: 'Bail 2026',
  installments: [
    { monthOffset: 0, day: 5, amount: 150000 },
    { monthOffset: 0, day: 20, amount: 150000 },
  ],
};

const set: <K extends keyof Draft>(k: K, v: Draft[K]) => void = () => {};

function renderPanel(
  over: Partial<React.ComponentProps<typeof FixedCostSheetPanel>> = {}
) {
  return renderToStaticMarkup(
    React.createElement(FixedCostSheetPanel, {
      title: 'Nouvelle charge',
      description: 'Une charge fixe est répartie sur les jours ouvrés.',
      submitLabel: 'Créer la charge',
      categories,
      draft: emptyDraft('cat-loyer'),
      set,
      error: null,
      pending: false,
      onCancel: () => {},
      onSubmit: () => {},
      ...over,
    })
  );
}

describe('FixedCostSheetPanel — drawer', () => {
  it('affiche le titre et la barre d’action de création', () => {
    const html = renderPanel();
    expect(html).toContain('Nouvelle charge');
    expect(html).toContain('Créer la charge');
    expect(html).toContain('Annuler');
  });

  it('préremplit tous les champs en édition, échéances comprises', () => {
    const html = renderPanel({
      title: 'Modifier la charge',
      submitLabel: 'Enregistrer',
      draft: draftFromRow(row),
    });
    expect(html).toContain('Modifier la charge');
    expect(html).toContain('Enregistrer');
    expect(html).toContain('value="Loyer"');
    expect(html).toContain('value="300000"');
    expect(html).toContain('value="2026-01-05"');
    expect(html).toContain('value="2026-12-31"');
    expect(html).toContain('value="Bail 2026"');
    // Échéances : deux lignes préremplies.
    expect(html).toContain('id="fc-inst-d-0"');
    expect(html).toContain('id="fc-inst-d-1"');
    expect(html).toContain('value="20"');
    expect(html).toContain('value="150000"');
  });

  it('affiche l’erreur serveur dans le drawer, sans le fermer', () => {
    const html = renderPanel({
      error: 'La fin doit être après la prise d’effet',
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('La fin doit être après la prise d’effet');
    // Le bouton d’enregistrement reste présent : le drawer est toujours ouvert.
    expect(html).toContain('Créer la charge');
  });
});

const managerRow: FixedCostManagerRow = {
  id: 'fc-1',
  categoryName: 'Loyer',
  active: true,
  ...row,
};

function renderManager(costs: FixedCostManagerRow[]) {
  return renderToStaticMarkup(
    React.createElement(FixedCostManager, { costs, categories })
  );
}

describe('FixedCostManager — plus de formulaire inline', () => {
  it('la liste ne rend aucun champ de saisie', () => {
    const html = renderManager([managerRow]);
    // Le Switch Radix porte un input checkbox interne (aria-hidden) : on
    // vérifie l'absence de tout champ de saisie visible.
    expect(html).not.toMatch(/<input[^>]*type="(text|number|date|search)"/);
    expect(html).not.toMatch(/<select\b/);
    expect(html).not.toMatch(/<textarea\b/);
    expect(html).not.toMatch(/<form\b/);
    expect(html).not.toContain('fc-label');
  });

  it('ouvre la création depuis le bouton « Nouvelle charge »', () => {
    expect(renderManager([])).toContain('Nouvelle charge');
  });

  it('la ligne propose un crayon d’édition, pas un formulaire', () => {
    const html = renderManager([managerRow]);
    expect(html).toContain('aria-label="Modifier"');
    expect(html).not.toContain('fc-label');
  });
});
