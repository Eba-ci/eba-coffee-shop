import { describe, expect, it } from 'vitest';
import { linkError, type LinkExpenseFacts } from './link-rules';

const expense: LinkExpenseFacts = {
  id: 'e',
  categoryId: 'cat',
  fixedCostId: null,
  dueDate: null,
  isSalary: false,
};
const cost = { label: 'Loyer', categoryId: 'cat' };
const target = { costId: 'c1', dueDate: '2026-03-10' };

describe('linkError', () => {
  it('accepte une dépense libre de la bonne catégorie sur une vraie échéance', () => {
    expect(linkError(expense, cost, target, true)).toBeNull();
  });
  it('refuse une autre catégorie', () => {
    expect(
      linkError({ ...expense, categoryId: 'x' }, cost, target, true)
    ).toMatch(/inter-catégories/);
  });
  it('refuse une dépense déjà liée à une autre échéance, accepte le rejeu identique', () => {
    const linked = { ...expense, fixedCostId: 'c1', dueDate: '2026-02-10' };
    expect(linkError(linked, cost, target, true)).toMatch(/déjà/);
    expect(
      linkError({ ...linked, dueDate: '2026-03-10' }, cost, target, true)
    ).toBeNull();
  });
  it('refuse le salaire, une dépense ou une charge absente, une date hors échéancier', () => {
    expect(
      linkError({ ...expense, isSalary: true }, cost, target, true)
    ).toMatch(/salaire/);
    expect(linkError(null, cost, target, true)).toMatch(/introuvable/);
    expect(linkError(expense, null, target, true)).toMatch(/introuvable/);
    expect(linkError(expense, cost, target, false)).toMatch(/pas une échéance/);
  });
});
