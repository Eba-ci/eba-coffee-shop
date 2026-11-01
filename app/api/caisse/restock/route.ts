// app/api/caisse/restock/route.ts
//
// POST /api/caisse/restock
// Réappro rapide d'un produit ou d'un « goût » (option de supplément) DEPUIS la
// caisse, sans passer par la gestion du menu. Cas pratique : une nouvelle
// fournée de tartelettes sort de cuisine → le caissier fixe le nombre
// disponible du goût et peut l'ajouter immédiatement à une commande.
//
// `stock` est la valeur ABSOLUE du stock disponible (on remplace, on n'ajoute
// pas). 0 = épuisé.
//
// Body :
//   { target: 'product', productId, stock }
//   { target: 'option',  productId, groupName, optionName, stock }
//
// Réservé à la caisse (`requireCashier`). Renvoie le nouveau stock pour que le
// client mette à jour son menu local (stock live sans rechargement).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCashier } from '@/lib/auth-helpers';
import { setOptionStockByRef, setProductStockById } from '@/lib/menu-mutations';
import { revalidatePublicMenu } from '@/lib/revalidate-public-menu';
import { runWithStockContext } from '@/lib/stock-history/source-context';

// Plafond de garde-fou anti-faute de frappe.
const MAX_STOCK = 100_000;

const bodySchema = z.discriminatedUnion('target', [
  z.object({
    target: z.literal('product'),
    productId: z.string().min(1),
    stock: z.number().int().min(0).max(MAX_STOCK),
  }),
  z.object({
    target: z.literal('option'),
    productId: z.string().min(1),
    groupName: z.string().min(1),
    optionName: z.string().min(1),
    stock: z.number().int().min(0).max(MAX_STOCK),
  }),
]);

export async function POST(req: Request) {
  let session;
  try {
    session = await requireCashier();
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Corps de requête invalide' },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  try {
    const result = await runWithStockContext(
      { source: 'STAFF', actorId: session.user.id },
      () =>
        body.target === 'product'
          ? setProductStockById({
              productId: body.productId,
              stock: body.stock,
            })
          : setOptionStockByRef({
              productId: body.productId,
              groupName: body.groupName,
              optionName: body.optionName,
              stock: body.stock,
            })
    );
    revalidatePublicMenu();
    return NextResponse.json({ ok: true, stockQuantity: result.stockQuantity });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Réappro impossible';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
