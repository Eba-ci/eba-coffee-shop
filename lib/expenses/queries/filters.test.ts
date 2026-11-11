// Confidentialité des lignes de salaire : par défaut, `buildExpenseWhere`
// exclut les dépenses liées à un versement (`salaryPaymentId != null`). Seul
// un appel explicite (`includeSalary: true`, écrans ADMIN) les inclut.

import { describe, expect, it } from 'vitest';
import { buildExpenseWhere } from './filters';

describe('buildExpenseWhere — lignes de salaire', () => {
  it('masque les lignes de salaire par défaut', () => {
    expect(buildExpenseWhere({})).toMatchObject({ salaryPaymentId: null });
  });

  it('masque aussi quand des filtres sont posés', () => {
    const where = buildExpenseWhere({
      categoryId: 'cat-sal',
      paymentMethod: 'WAVE',
      search: 'x',
    });
    expect(where.salaryPaymentId).toBeNull();
  });

  it('inclut les lignes de salaire quand l’appelant l’autorise (ADMIN)', () => {
    const where = buildExpenseWhere({ includeSalary: true });
    expect(where.salaryPaymentId).toBeUndefined();
    expect('salaryPaymentId' in where).toBe(false);
  });
});
