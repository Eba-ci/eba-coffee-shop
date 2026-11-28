import { describe, expect, it } from 'vitest';
import { periodStart, viewDefaultSort } from './views';

describe('periodStart', () => {
  const now = new Date('2026-11-28T12:00:00Z');

  it('renvoie undefined sans période (tout l’historique)', () => {
    expect(periodStart(null, now)).toBeUndefined();
    expect(periodStart(undefined, now)).toBeUndefined();
  });

  it('recule du bon nombre de jours', () => {
    expect(periodStart('30j', now)).toEqual(new Date('2026-10-29T12:00:00Z'));
    expect(periodStart('90j', now)).toEqual(new Date('2026-08-30T12:00:00Z'));
    expect(periodStart('12m', now)).toEqual(new Date('2025-11-28T12:00:00Z'));
  });
});

describe('viewDefaultSort', () => {
  it('Meilleurs → total acheté, Plus fidèles et Réguliers → commandes', () => {
    expect(viewDefaultSort('meilleurs')).toBe('totalSpent');
    expect(viewDefaultSort('fideles')).toBe('ordersCount');
    expect(viewDefaultSort('reguliers')).toBe('ordersCount');
  });

  it('sans vue : pas de tri imposé', () => {
    expect(viewDefaultSort(null)).toBeUndefined();
  });
});
