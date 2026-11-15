import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartialNotice, partialNoticeText } from './partial-notice';

describe('PartialNotice', () => {
  it('annonce le reliquat exact et l’arriéré', () => {
    const t = partialNoticeText(
      { kind: 'partial', unpaid: 50_000, arrears: 20_000 },
      '2026-11'
    );
    expect(t).toMatch(/Il restera .*50.*000.* d’impayé sur novembre 2026/i);
    expect(t).toMatch(/20.*000.* d’arriéré/);
  });

  it('signale un excédent', () => {
    expect(
      partialNoticeText(
        { kind: 'excess', excess: 5_000, arrears: 0 },
        '2026-11'
      )
    ).toMatch(/dépasse/);
  });

  it('ne rend rien sans avertissement', () => {
    expect(
      renderToStaticMarkup(
        React.createElement(PartialNotice, { warning: null, month: '2026-11' })
      )
    ).toBe('');
  });
});
