// app/api/caisse/orders/[id]/status/route.ts
//
// PATCH /api/caisse/orders/:id/status
// Body : { status: OrderStatus, onAccount?: boolean }
//
// Validation : transitions autorisées via lib/order-permissions selon le rôle.
//
// `onAccount` n'a de sens que vers PREPARING (entrée en cuisine « ardoise ») :
// il est transmis à `sendOrderToKitchen`, qui pose `Order.isOnAccount` SANS
// jamais toucher à `isPaid` — l'argent reste dû. Ignoré pour les autres cibles.
//
// `coverShortage` : le staff a confirmé à l'écran avoir produit la quantité
// manquante. Une pénurie renvoie donc un 409 PORTANT LA LISTE des manques
// (`shortage`), l'écran pose la question, et rappelle avec ce drapeau — au lieu
// d'envoyer le caissier corriger le stock dans /dashboard/menu.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCashier } from '@/lib/auth-helpers';
import type { UserRole } from '@/generated/prisma/client';
import { orderStatusSchema } from '@/lib/schemas/order';
import {
  setOrderStatus,
  sendOrderToKitchen,
  buildShortagePayload,
  OrderMutationError,
  StockShortageError,
} from '@/lib/order-mutations';

const bodySchema = z.object({
  status: orderStatusSchema,
  onAccount: z.boolean().optional(),
  coverShortage: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  let session;
  try {
    session = await requireCashier();
  } catch {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const role = session.user.role as UserRole;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Corps de requête invalide' },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // `setOrderStatus` délègue déjà à `sendOrderToKitchen` pour PREPARING,
    // mais sans pouvoir transmettre `opts` : on l'appelle directement dans ce
    // seul cas (mêmes gardes de rôle / concurrence, aucune logique dupliquée).
    if (parsed.data.onAccount && parsed.data.status === 'PREPARING') {
      await sendOrderToKitchen(id, role, {
        onAccount: true,
        coverShortage: parsed.data.coverShortage,
        actorId: session.user.id,
      });
    } else {
      await setOrderStatus(id, parsed.data.status, role, {
        coverShortage: parsed.data.coverShortage,
        actorId: session.user.id,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StockShortageError) {
      return NextResponse.json(await buildShortagePayload(id, err), {
        status: err.httpStatus,
      });
    }
    if (err instanceof OrderMutationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.httpStatus }
      );
    }
    throw err;
  }
}
