import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import type { CartItem } from '@/lib/cart-store';
import { DEFAULT_CONTACT_SETTINGS } from '@/lib/contact-settings';
import { buildReceipt } from './build';
import { ReceiptDocument } from './pdf';

const item = {
  cartId: 'c1',
  productId: 'p1',
  productName: 'Cappuccino',
  basePrice: 1500,
  coutMatiere: 0,
  coutEmballage: 0,
  quantity: 2,
  supplements: [
    { groupName: 'Goût', optionName: 'Vanille', price: 0, kind: 'flavor' },
    { groupName: 'Extra', optionName: 'Crème', price: 200 },
  ],
} as CartItem;

describe('reçu', () => {
  const receipt = buildReceipt({
    reference: 'EBA-20261101-A3F9',
    dailyNumber: 3,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    customerName: 'Awa Koné',
    items: [item],
    loyaltyDiscount: null,
    total: 3400,
    isPaid: true,
    paymentMode: 'WAVE',
    payments: [],
  });

  it('porte les prix et le mode de paiement', () => {
    expect(receipt.code).toBe('A3F9');
    expect(receipt.lines[0].net).toBe(3400);
    expect(receipt.paymentLabel).toBeTruthy();
  });

  it('se rend en PDF valide', async () => {
    const pdf = await renderToBuffer(
      ReceiptDocument({ receipt, contact: DEFAULT_CONTACT_SETTINGS })
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
