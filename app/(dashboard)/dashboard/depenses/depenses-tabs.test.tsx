import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DepensesTabs } from './depenses-tabs';

const content = (label: string) => React.createElement('p', null, label);

function render(showSalaires: boolean, defaultTab?: string) {
  return renderToStaticMarkup(
    React.createElement(DepensesTabs, {
      defaultTab,
      showSalaires,
      apercu: content('apercu-vu'),
      historique: content('historique-vu'),
      articles: content('articles-vu'),
      recurrentes: content('recurrentes-vu'),
      pointmort: content('pointmort-vu'),
      paiements: content('paiements-vu'),
      salaires: content('salaires-vu'),
    })
  );
}

describe('DepensesTabs — onglet Salaires réservé à l’ADMIN', () => {
  it('ne montre ni l’onglet ni le contenu Salaires pour un non-admin', () => {
    const html = render(false);
    expect(html).not.toContain('Salaires');
    expect(html).not.toContain('salaires-vu');
  });

  it('montre l’onglet Salaires pour un admin', () => {
    expect(render(true)).toContain('Salaires');
  });

  it('retombe sur Aperçu si un non-admin ouvre ?tab=salaires', () => {
    const html = render(false, 'salaires');
    expect(html).toContain('apercu-vu');
    expect(html).not.toContain('salaires-vu');
  });

  it('ouvre l’onglet Salaires pour un admin qui le demande', () => {
    const html = render(true, 'salaires');
    expect(html).toContain('salaires-vu');
  });
});
