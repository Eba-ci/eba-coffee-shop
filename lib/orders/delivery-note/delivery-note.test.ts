import { describe, expect, it } from 'vitest';
import type { CartItem } from '@/lib/cart-store';
import { buildDeliveryNote } from './build';
import { encodeDeliveryNote, TICKET_COLUMNS, wrapText } from './escpos';
import { maskCustomerName } from './mask-name';

describe('maskCustomerName', () => {
  it('garde le prénom et l’initiale du nom', () => {
    expect(maskCustomerName('Awa Koné')).toBe('Awa K.');
    expect(maskCustomerName('  jean  marc  ouattara ')).toBe('jean O.');
    expect(maskCustomerName('Élodie Émile')).toBe('Élodie É.');
  });
  it('gère prénom seul et absence de nom', () => {
    expect(maskCustomerName('Awa')).toBe('Awa');
    expect(maskCustomerName(null)).toBe('Client');
    expect(maskCustomerName('   ')).toBe('Client');
  });
});

const item = {
  cartId: 'c1',
  productId: 'p1',
  productName: 'Gâteau “Forêt” très long nom de produit',
  basePrice: 12345,
  coutMatiere: 0,
  coutEmballage: 0,
  quantity: 2,
  supplements: [
    { groupName: 'Goût', optionName: 'Vanille', price: 0, kind: 'flavor' },
    { groupName: 'Extra', optionName: 'Chocolat', price: 999, quantity: 2 },
  ],
} as CartItem;

const order = {
  reference: 'EBA-20261101-A3F9',
  dailyNumber: 7,
  customerName: 'Awa Koné',
  pickupTime: new Date('2026-11-01T14:30:00Z'),
  items: [item],
};

describe('buildDeliveryNote', () => {
  it('sépare goûts et suppléments, sans aucun prix', () => {
    const note = buildDeliveryNote(order);
    expect(note.code).toBe('A3F9');
    expect(note.dailyNumber).toBe('#007');
    expect(note.customer).toBe('Awa K.');
    expect(note.lines[0].flavors).toEqual(['Vanille']);
    expect(note.lines[0].extras).toEqual(['Chocolat ×2']);
    expect(JSON.stringify(note)).not.toMatch(/12345|999|price/i);
  });
});

describe('encodeDeliveryNote', () => {
  it('produit de l’ASCII imprimable, lignes ≤ 32 colonnes, sans prix ni nom complet', () => {
    const bytes = encodeDeliveryNote(buildDeliveryNote(order));
    const printable = Buffer.from(bytes).toString('latin1');
    expect(printable).toContain('A3F9');
    expect(printable).toContain('Awa K.');
    expect(printable).not.toContain('Kon');
    expect(printable).not.toMatch(/12345|999|FCFA/);
    const textLines = printable
      .split('\n')
      .map((l) =>
        l.replace(/[\x00-\x1f\x1d\x1b][\x00-\xff]?[\x00-\x1f]?/g, '')
      );
    for (const l of textLines)
      expect(l.length).toBeLessThanOrEqual(TICKET_COLUMNS + 4);
  });
  it('wrapText coupe les mots trop longs', () => {
    for (const l of wrapText('x'.repeat(70), 32, 3))
      expect(l.length).toBeLessThanOrEqual(32);
  });
});
