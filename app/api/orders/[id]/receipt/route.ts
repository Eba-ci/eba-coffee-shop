// GET /api/orders/:id/receipt
// Reçu PDF d'une commande (avec prix). Accessible au client par l'identifiant
// de commande (même modèle que la page de suivi /commande/:id) et au staff.

import { NextResponse } from 'next/server';
import { allowReceiptRead, clientIp } from '@/lib/enumeration-rate-limit';
import { renderReceiptPdf } from '@/lib/orders/receipt/render';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!allowReceiptRead(clientIp(req))) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
  }
  const { id } = await params;
  const result = await renderReceiptPdf(id);
  if (!result) {
    return NextResponse.json(
      { error: 'Commande introuvable' },
      { status: 404 }
    );
  }
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recu-${result.code}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
