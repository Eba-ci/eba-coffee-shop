// GET /api/orders/:id/delivery-note
// Bon de livraison (sans prix, nom abrégé) : JSON pour l'aperçu navigateur et
// lien RawBT pour l'impression thermique 58 mm. Staff uniquement.

import { NextResponse } from 'next/server';
import { requireOrdersView } from '@/lib/auth-helpers';
import type { CartItem } from '@/lib/cart-store';
import { buildDeliveryNote } from '@/lib/orders/delivery-note/build';
import {
  encodeDeliveryNote,
  rawbtUrl,
} from '@/lib/orders/delivery-note/escpos';
import { readLogoRaster } from '@/lib/orders/logo';
import { withStaffVisible } from '@/lib/orders/visibility';
import prisma from '@/lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOrdersView();
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: withStaffVisible({ id }),
  });
  if (!order) {
    return NextResponse.json(
      { error: 'Commande introuvable' },
      { status: 404 }
    );
  }
  const note = buildDeliveryNote({
    ...order,
    items: order.items as unknown as CartItem[],
  });
  return NextResponse.json({
    note,
    rawbt: rawbtUrl(encodeDeliveryNote(note, await readLogoRaster())),
  });
}
