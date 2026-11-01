// lib/orders/receipt/render.ts
import { renderToBuffer } from '@react-pdf/renderer';
import type { CartItem } from '@/lib/cart-store';
import { getContactSettings } from '@/lib/contact-settings-db';
import prisma from '@/lib/prisma';
import { buildReceipt } from './build';
import { ReceiptDocument } from './pdf';

/** Génère le PDF du reçu, ou `null` si la commande est introuvable. */
export async function renderReceiptPdf(
  orderId: string
): Promise<{ pdf: Buffer; code: string } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true },
  });
  if (!order || order.status === 'CANCELLED') return null;
  const receipt = buildReceipt({
    ...order,
    items: order.items as unknown as CartItem[],
  });
  const contact = await getContactSettings();
  const pdf = await renderToBuffer(ReceiptDocument({ receipt, contact }));
  return { pdf, code: receipt.code };
}
