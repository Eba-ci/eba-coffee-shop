import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DepensesTabs } from './depenses-tabs';

const content = (label: string) => React.createElement('p', null, label);

function render(defaultTab?: string) {
  return renderToStaticMarkup(
    React.createElement(DepensesTabs, {
      defaultTab,
      apercu: content('apercu-vu'),
      historique: content('historique-vu'),
      articles: content('articles-vu'),
      pointmort: content('pointmort-vu'),
      paiements: content('paiements-vu'),
    })
  );
}

describe('DepensesTabs — l’onglet Salaires a disparu (#450)', () => {
  it('ne montre plus l’onglet Salaires', () => {
    const html = render();
    expect(html).not.toContain('Salaires');
    expect(html).toContain('Point mort');
    expect(html).toContain('Paiements');
  });

  it('retombe sur Aperçu si ?tab=salaires traîne encore', () => {
    const html = render('salaires');
    expect(html).not.toContain('Salaires');
  });
});
