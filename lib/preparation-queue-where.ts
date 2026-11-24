// lib/preparation-queue-where.ts
//
// Périmètre de la file cuisine : toutes les commandes OUVERTES, quel que soit le
// jour. Pur (aucun accès base) pour être testable.
//
//   A. En cuisine ou prêtes (`PREPARING`, `READY`) : visibles tant qu'elles ne sont
//      pas récupérées, même créées la veille.
//   B. Programmées pas encore lancées (`NEW` avec créneau, stock non réservé) :
//      « à produire » et lançables d'un tap — retard (retrait passé, jamais lancée)
//      et retraits lointains compris.
//
// Un walk-in `NEW` sans créneau (en attente d'encaissement) reste invisible ici.
//
// La règle de visibilité staff (`withStaffVisible`) est appliquée à l'APPEL, pour
// que `visibility-guard.test.ts` la voie dans la lecture.

import type { Prisma } from '@/generated/prisma/client';

export function buildPreparationWhere(): Prisma.OrderWhereInput {
  // ⚠️ Une seule clé `OR` par littéral d'objet : deux `OR` frères dans le même
  // objet JS, la seconde écrase la première EN SILENCE. D'où les `AND` explicites.
  return {
    OR: [
      { status: { in: ['PREPARING', 'READY'] } },
      {
        AND: [
          { status: 'NEW' as const },
          { stockReservedAt: null },
          { pickupTime: { not: null } },
        ],
      },
    ],
  };
}
