// lib/cashier-queue/where.ts
//
// Périmètre de la file caisse : toutes les commandes OUVERTES, quel que soit le
// jour de création ou de retrait. Pur (aucun accès base) pour être testable.
//
// Ouverte = encore en cours (`NEW`, `PREPARING`, `READY`). Une commande de la
// veille ni lancée ni récupérée ne doit pas disparaître à minuit.
//
// Seule exception : une commande RÉCUPÉRÉE (`COMPLETED`) mais impayée. C'est une
// dette, elle vit dans l'ardoise (`lib/ardoise.ts`) : la caisse ne l'affiche que le
// jour de sa création (« à encaisser » tout de suite), jamais le lendemain.
//
// La règle de visibilité staff (`withStaffVisible`) est appliquée à l'APPEL, pour
// que `visibility-guard.test.ts` la voie dans la lecture.

import type { Prisma } from '@/generated/prisma/client';
import { endOfLocalDay, startOfLocalDay } from '@/lib/timezone';

export const OPEN_ORDER_STATUSES = ['NEW', 'PREPARING', 'READY'] as const;

export function buildQueueWhere(now: Date): Prisma.OrderWhereInput {
  // Bornes ancrées sur Abidjan, PAS sur le fuseau du runtime (cf. `lib/preparation-queue.ts`).
  const dayStart = startOfLocalDay(now);
  const dayEnd = endOfLocalDay(now);

  return {
    // Une commande annulée (ou remboursée) quitte la file caisse.
    status: { not: 'CANCELLED' },
    OR: [
      // Encore ouverte : visible tous les jours, sans borne de date.
      { status: { in: [...OPEN_ORDER_STATUSES] } },
      // Récupérée mais impayée : dette du jour seulement (le reste = ardoise).
      {
        status: 'COMPLETED',
        isPaid: false,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    ],
  };
}
