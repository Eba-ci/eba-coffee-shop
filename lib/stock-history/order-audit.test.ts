import { describe, expect, it } from 'vitest';
import {
  compareOrderToJournal,
  explainOrderStock,
  isStockDefect,
  type MovementSum,
  type ResourceNeed,
} from './order-audit';

const product: ResourceNeed = {
  kind: 'PRODUCT',
  resourceId: 'p1',
  label: 'Beignet',
  needed: 3,
};
const flavor: ResourceNeed = {
  kind: 'OPTION',
  resourceId: 'o1',
  label: 'Goûts · Chocolat',
  needed: 3,
};
const sum = (r: ResourceNeed, consumed: number): MovementSum => ({
  kind: r.kind,
  resourceId: r.resourceId,
  label: r.label,
  consumed,
});

describe('compareOrderToJournal', () => {
  it('ok quand chaque ressource a décompté exactement son besoin', () => {
    const res = compareOrderToJournal({
      needs: [product, flavor],
      sums: [sum(product, 3), sum(flavor, 3)],
    });
    expect(res.verdict).toBe('ok');
    expect(res.lines.map((l) => l.status)).toEqual(['ok', 'ok']);
  });

  it('missing quand le goût n’a pas été décompté (le cas « le stock ne baisse pas »)', () => {
    const res = compareOrderToJournal({
      needs: [product, flavor],
      sums: [sum(product, 3)],
    });
    expect(res.verdict).toBe('missing');
    expect(res.lines.find((l) => l.resourceId === 'o1')).toMatchObject({
      consumed: 0,
      needed: 3,
      status: 'missing',
    });
  });

  it('le libellé figé du journal (avec le produit) prime sur celui du besoin', () => {
    const res = compareOrderToJournal({
      needs: [flavor],
      sums: [{ ...sum(flavor, 3), label: 'Crêpe · Goûts · Chocolat' }],
    });
    expect(res.lines[0].label).toBe('Crêpe · Goûts · Chocolat');
  });

  it('missing aussi pour une consommation partielle', () => {
    const res = compareOrderToJournal({
      needs: [product],
      sums: [sum(product, 2)],
    });
    expect(res.verdict).toBe('missing');
  });

  it('excess quand le journal décompte plus que la commande', () => {
    const res = compareOrderToJournal({
      needs: [product],
      sums: [sum(product, 5)],
    });
    expect(res.verdict).toBe('excess');
  });

  it('une ressource décomptée mais absente du besoin est signalée en excès', () => {
    const res = compareOrderToJournal({
      needs: [product],
      sums: [sum(product, 3), sum(flavor, 3)],
    });
    expect(res.verdict).toBe('excess');
    expect(res.lines.find((l) => l.resourceId === 'o1')).toMatchObject({
      needed: 0,
      consumed: 3,
      status: 'excess',
    });
  });

  it('une consommation nette nulle n’ajoute aucune ligne (réservation puis restitution)', () => {
    const res = compareOrderToJournal({
      needs: [product],
      sums: [sum(product, 3), sum(flavor, 0)],
    });
    expect(res.verdict).toBe('ok');
    expect(res.lines).toHaveLength(1);
  });

  it('unknown quand tout concorde mais qu’une option du besoin est introuvable', () => {
    const res = compareOrderToJournal({
      needs: [product],
      sums: [sum(product, 3)],
      unresolved: 1,
    });
    expect(res.verdict).toBe('unknown');
  });

  it('un manque l’emporte sur unknown', () => {
    const res = compareOrderToJournal({
      needs: [product],
      sums: [],
      unresolved: 1,
    });
    expect(res.verdict).toBe('missing');
  });
});

const base = {
  status: 'PREPARING',
  launched: true,
  deferred: false,
  held: false,
  beforeJournal: false,
  verdict: 'ok' as const,
  allUnlimited: false,
};

describe('explainOrderStock', () => {
  it('lancée et conforme', () => {
    expect(explainOrderStock(base)).toMatchObject({
      code: 'counted',
      tone: 'ok',
    });
  });

  it('lancée puis annulée : stock non rendu, expliqué, pas un défaut', () => {
    const e = explainOrderStock({ ...base, status: 'CANCELLED' });
    expect(e.code).toBe('cancelled_after_launch');
    expect(isStockDefect(e.code)).toBe(false);
  });

  it('lancée mais stock illimité : cas normal expliqué', () => {
    expect(explainOrderStock({ ...base, allUnlimited: true })).toMatchObject({
      code: 'unlimited',
      tone: 'info',
    });
  });

  it('lancée sans décompte : défaut', () => {
    const e = explainOrderStock({ ...base, verdict: 'missing' });
    expect(e).toMatchObject({ code: 'missing', tone: 'danger' });
    expect(isStockDefect(e.code)).toBe(true);
  });

  it('avant le journal : rien à conclure, même si le verdict serait mauvais', () => {
    expect(
      explainOrderStock({ ...base, beforeJournal: true, verdict: 'missing' })
    ).toMatchObject({ code: 'before_journal', tone: 'info' });
  });

  it('servie sans jamais avoir été lancée : défaut', () => {
    const e = explainOrderStock({
      ...base,
      status: 'COMPLETED',
      launched: false,
    });
    expect(e.code).toBe('served_without_stock');
    expect(isStockDefect(e.code)).toBe(true);
  });

  it.each([
    [{ status: 'CANCELLED' }, 'cancelled_before_launch'],
    [{ status: 'NEW', deferred: true }, 'deferred'],
    [{ status: 'NEW', held: true }, 'held'],
    [{ status: 'NEW' }, 'not_launched'],
  ])('non lancée %j → %s (cas normal, pas un défaut)', (over, code) => {
    const e = explainOrderStock({ ...base, launched: false, ...over });
    expect(e.code).toBe(code);
    expect(isStockDefect(e.code)).toBe(false);
  });

  it('option introuvable : indéterminé, pas un défaut', () => {
    const e = explainOrderStock({ ...base, verdict: 'unknown' });
    expect(e.code).toBe('unknown');
    expect(isStockDefect(e.code)).toBe(false);
  });
});
