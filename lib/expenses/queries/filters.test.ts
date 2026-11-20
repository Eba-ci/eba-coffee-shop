// La ligne globale de masse salariale est une dépense comme les autres pour
// les lectures : `buildExpenseWhere` ne l'exclut plus (plus de trou comptable
// pour les non-admin). Le détail par employé n'existe pas dans cette table.

import { describe, expect, it } from 'vitest';
import { buildExpenseWhere } from './filters';

describe('buildExpenseWhere — masse salariale', () => {
  it('n’exclut aucune ligne par défaut', () => {
    expect(buildExpenseWhere({})).toEqual({});
  });

  it('applique seulement les filtres demandés', () => {
    const where = buildExpenseWhere({
      categoryId: 'cat-sal',
      paymentMethod: 'WAVE',
    });
    expect(where).toEqual({ categoryId: 'cat-sal', paymentMethod: 'WAVE' });
  });
});
