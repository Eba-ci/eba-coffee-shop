import { describe, expect, it } from 'vitest';
import { parseStockHistorySearchParams } from './parse-search-params';

describe('parseStockHistorySearchParams', () => {
  it('sans paramètre : tout l’historique, page 1, aucun filtre', () => {
    const p = parseStockHistorySearchParams({});
    expect(p).toMatchObject({
      page: 1,
      isAll: true,
      dateFrom: undefined,
      dateToExclusive: undefined,
      reason: undefined,
      search: undefined,
    });
  });

  it('plage : fin incluse → borne exclusive au lendemain', () => {
    const p = parseStockHistorySearchParams({
      from: '2026-10-26',
      to: '2026-10-27',
    });
    expect(p.isAll).toBe(false);
    expect(p.dateFrom).toEqual(new Date('2026-10-26T00:00:00.000Z'));
    expect(p.dateToExclusive).toEqual(new Date('2026-10-28T00:00:00.000Z'));
  });

  it('une seule borne couvre ce jour', () => {
    const p = parseStockHistorySearchParams({ from: '2026-10-27' });
    expect(p.dateFrom).toEqual(new Date('2026-10-27T00:00:00.000Z'));
    expect(p.dateToExclusive).toEqual(new Date('2026-10-28T00:00:00.000Z'));
    expect(p.toStr).toBe('2026-10-27');
  });

  it('range=all annule les dates', () => {
    const p = parseStockHistorySearchParams({
      from: '2026-10-26',
      range: 'all',
    });
    expect(p.isAll).toBe(true);
    expect(p.dateFrom).toBeUndefined();
  });

  it('valeurs invalides : retombent sur l’absence de filtre', () => {
    const p = parseStockHistorySearchParams({
      reason: 'N_IMPORTE_QUOI',
      source: 'ROBOT',
      from: 'hier',
      page: '-3',
    });
    expect(p.reason).toBeUndefined();
    expect(p.source).toBeUndefined();
    expect(p.isAll).toBe(true);
    expect(p.page).toBe(1);
  });

  it('recherche et ressource nettoyées', () => {
    const p = parseStockHistorySearchParams({
      search: '  beignet ',
      resource: ' p1 ',
      order: 'o1',
      reason: 'ORDER_KITCHEN',
    });
    expect(p).toMatchObject({
      search: 'beignet',
      resourceId: 'p1',
      orderId: 'o1',
      reason: 'ORDER_KITCHEN',
    });
  });
});
