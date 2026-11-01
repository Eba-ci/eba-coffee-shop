// lib/orders/delivery-note/build.ts
//
// Bon de livraison : ce que lit le livreur. Volontairement SANS aucun prix —
// le type ne les porte pas, donc aucun rendu (ticket, impression navigateur)
// ne peut les afficher par erreur.

import type { CartItem } from '@/lib/cart-store';
import { formatSupplementLabel, getPickupCode } from '@/lib/orders/format';
import { splitSupplementsByKind } from '@/lib/supplements/kind';
import { maskCustomerName } from './mask-name';

export type DeliveryNoteLine = {
  quantity: number;
  productName: string;
  flavors: string[];
  extras: string[];
};

export type DeliveryNote = {
  code: string;
  dailyNumber: string;
  customer: string;
  pickup: string | null;
  note: string | null;
  lines: DeliveryNoteLine[];
};

export type DeliveryNoteSource = {
  reference: string;
  dailyNumber: number;
  customerName: string | null;
  pickupTime: Date | null;
  note?: string | null;
  items: CartItem[];
};

const pickupFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Abidjan',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function buildDeliveryNote(order: DeliveryNoteSource): DeliveryNote {
  return {
    code: getPickupCode(order.reference),
    dailyNumber: `#${String(order.dailyNumber).padStart(3, '0')}`,
    customer: maskCustomerName(order.customerName),
    pickup: order.pickupTime ? pickupFormatter.format(order.pickupTime) : null,
    note: order.note?.trim() || null,
    lines: order.items.map((item) => {
      const { flavors, extras } = splitSupplementsByKind(item.supplements);
      return {
        quantity: item.quantity,
        productName: item.productName,
        flavors: flavors.map(formatSupplementLabel),
        extras: extras.map(formatSupplementLabel),
      };
    }),
  };
}
