import { describe, expect, it } from 'vitest';
import { groupLines, lineQuantity } from './ledger-lines';
import type { ResourceLine } from '@/lib/stock-history/order-audit';

const line = (o: Partial<ResourceLine>): ResourceLine => ({
  kind: 'PRODUCT',
  resourceId: 'p1',
  label: 'Triletche',
  needed: 1,
  consumed: 1,
  status: 'ok',
  ...o,
});

describe('groupLines', () => {
  it('groupe les goûts sous leur produit sans répéter son nom', () => {
    const g = groupLines([
      line({}),
      line({
        kind: 'OPTION',
        resourceId: 'o1',
        label: 'Triletche · Goût · Carmel café',
      }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]?.own?.resourceId).toBe('p1');
    expect(g[0]?.children[0]?.sub).toBe('Goût · Carmel café');
  });
});

describe('lineQuantity', () => {
  it('ne dit pas « attendu » quand tout est conforme', () => {
    expect(lineQuantity(line({}), true)).toEqual({ text: '−1', tone: 'ok' });
  });
  it('signale un manque', () => {
    const q = lineQuantity(line({ consumed: 0, status: 'missing' }), true);
    expect(q.tone).toBe('danger');
    expect(q.text).toContain('à retirer');
  });
  it('signale un excès', () => {
    expect(
      lineQuantity(line({ consumed: 2, status: 'excess' }), true).tone
    ).toBe('warn');
  });
  it('commande non jugée : neutre', () => {
    expect(
      lineQuantity(line({ consumed: 0, status: 'missing' }), false)
    ).toEqual({ text: 'à retirer : 1', tone: 'muted' });
  });
});
