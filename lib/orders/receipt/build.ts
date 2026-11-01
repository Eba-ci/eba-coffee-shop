// lib/orders/receipt/build.ts
//
// Reçu client (avec prix). Données pures, indépendantes du rendu PDF.

import type { PaymentMode } from '@/generated/prisma/client';
import type { CartItem } from '@/lib/cart-store';
import { formatSupplementLabel, getPickupCode } from '@/lib/orders/format';
import { getItemGross, getItemNet } from '@/lib/orders/totals';
import { PAYMENT_MODE_LABELS } from '@/lib/payment-modes';
import { splitSupplementsByKind } from '@/lib/supplements/kind';

export type ReceiptLine = {
  quantity: number;
  productName: string;
  details: string[];
  gross: number;
  net: number;
};

export type Receipt = {
  code: string;
  dailyNumber: string;
  date: string;
  customerName: string | null;
  lines: ReceiptLine[];
  loyaltyDiscount: number;
  total: number;
  paid: boolean;
  paymentLabel: string | null;
};

export type ReceiptSource = {
  reference: string;
  dailyNumber: number;
  createdAt: Date;
  customerName: string | null;
  items: CartItem[];
  loyaltyDiscount: number | null;
  total: number;
  isPaid: boolean;
  paymentMode: PaymentMode | null;
  payments: { mode: PaymentMode }[];
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Abidjan',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function buildReceipt(order: ReceiptSource): Receipt {
  const modes = order.paymentMode
    ? [order.paymentMode]
    : [...new Set(order.payments.map((p) => p.mode))];
  return {
    code: getPickupCode(order.reference),
    dailyNumber: `#${String(order.dailyNumber).padStart(3, '0')}`,
    date: dateFormatter.format(order.createdAt),
    customerName: order.customerName?.trim() || null,
    lines: order.items.map((item) => {
      const { flavors, extras } = splitSupplementsByKind(item.supplements);
      return {
        quantity: item.quantity,
        productName: item.productName,
        details: [
          ...(flavors.length
            ? [`Goûts : ${flavors.map(formatSupplementLabel).join(', ')}`]
            : []),
          ...(extras.length
            ? [`Suppléments : ${extras.map(formatSupplementLabel).join(', ')}`]
            : []),
        ],
        gross: getItemGross(item),
        net: getItemNet(item),
      };
    }),
    loyaltyDiscount: order.loyaltyDiscount ?? 0,
    total: order.total,
    paid: order.isPaid,
    paymentLabel: modes.length
      ? modes.map((m) => PAYMENT_MODE_LABELS[m]).join(' + ')
      : null,
  };
}
