// Mutations de commandes — kitchen.

import type { UserRole } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { canTransition } from '@/lib/order-permissions';
import type { CartItem } from '@/lib/cart-store';
import { notifyOrderCustomer } from '@/lib/push-notify';
import { notifyKitchen } from './notify';
import { OrderMutationError, StockShortageError } from './errors';
import {
  reserveStockOnce,
  notifyPendingOrdersOfShortage,
} from './stock-reservation';

/** Envoie une commande en cuisine (→ `PREPARING`) et RÉSERVE son stock, une seule fois. */
export async function sendOrderToKitchen(
  id: string,
  role: UserRole,
  opts?: {
    onAccount?: boolean;
    coverShortage?: boolean;
    actorId?: string | null;
  }
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      status: true,
      items: true,
      dailyNumber: true,
      reference: true,
      depositRequired: true,
      depositPaid: true,
    },
  });
  if (!order) {
    throw new OrderMutationError('Commande introuvable', 404);
  }

  if (!canTransition(order.status, 'PREPARING', role)) {
    throw new OrderMutationError(
      `Transition non autorisée : ${order.status} → PREPARING`,
      403
    );
  }

  if (
    order.depositRequired &&
    (order.depositPaid ?? 0) < order.depositRequired
  ) {
    const remaining = order.depositRequired - (order.depositPaid ?? 0);
    throw new OrderMutationError(
      `Acompte requis avant l'entrée en cuisine : ${remaining} F restant sur ${order.depositRequired} F.`,
      409
    );
  }

  const items = order.items as unknown as CartItem[];

  let reserved: boolean;
  try {
    reserved = await prisma.$transaction(async (tx) => {
      // Réservation AVANT l'écriture du statut : une pénurie fait échouer la
      // transaction entière, la commande reste donc là où elle était.
      const claimed = await reserveStockOnce(tx, id, items, {
        coverShortage: opts?.coverShortage,
        actorId: opts?.actorId,
      });

      const result = await tx.order.updateMany({
        where: { id, status: order.status },
        data: {
          status: 'PREPARING',
          preparingStartedAt: new Date(),
          ...(opts?.onAccount ? { isOnAccount: true } : {}),
        },
      });
      if (result.count === 0) {
        throw new OrderMutationError(
          'État déjà modifié par un autre caissier',
          409
        );
      }

      return claimed;
    });
  } catch (err) {
    if (err instanceof StockShortageError) {
      notifyOrderCustomer(id, 'ITEM_UNAVAILABLE');
    }
    throw err;
  }

  notifyOrderCustomer(id, 'PREPARING');
  notifyKitchen({
    id,
    dailyNumber: order.dailyNumber,
    reference: order.reference,
    items,
  });

  // Fan-out uniquement si CET appel a réellement décrémenté : une ré-entrée en
  // cuisine (après undo) ne change rien au stock, donc rien à annoncer.
  if (reserved) {
    notifyPendingOrdersOfShortage(id, items).catch((err) => {
      console.error('[order-mutations] fan-out stock épuisé échoué :', err);
    });
  }
}
