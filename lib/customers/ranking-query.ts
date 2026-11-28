// Lecture de TOUS les clients qui ont commandé, classés du meilleur au moins
// bon (total acheté net des remboursements, puis nombre de commandes). Mêmes
// règles que la liste (`stats-rules.ts` : commande comptée, remboursement
// déduit), calculées une seule fois pour tous les clients : pas de pagination.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { statsJoin } from './filter';
import type { RankedRow } from './ranking-csv';

export async function getCustomerRanking(): Promise<RankedRow[]> {
  return prisma.$queryRaw<RankedRow[]>(
    Prisma.sql`
        SELECT c.name, c.phone,
               COALESCE(s.orders, 0)::int AS orders,
               (COALESCE(s.gross, 0) - COALESCE(rf.refunded, 0))::int AS total,
               COALESCE(s.days, 0)::int AS days,
               s.first_order AS "firstOrderAt", s.last_order AS "lastOrderAt"
        FROM customer c ${statsJoin()}
        WHERE c."anonymizedAt" IS NULL AND COALESCE(s.orders, 0) > 0
        ORDER BY total DESC, orders DESC, c."createdAt", c.id`
  );
}
