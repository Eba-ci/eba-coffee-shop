// lib/stock-history/last-movements.ts
//
// Dernier mouvement de chaque ressource (hors relevé de départ), pour afficher
// d'un coup d'œil l'impact récent dans les tableaux de stock.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import type { StockReason } from './types';

export type LastMovement = {
  resourceId: string;
  createdAt: Date;
  reason: StockReason;
  delta: number | null;
};

export async function getLastMovements(
  resourceIds: string[]
): Promise<Map<string, LastMovement>> {
  if (resourceIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<LastMovement[]>`
    SELECT DISTINCT ON ("resourceId") "resourceId", "createdAt", "reason", "delta"
    FROM stock_movement
    WHERE "resourceId" IN (${Prisma.join(resourceIds)})
      AND "reason" NOT IN ('BASELINE', 'ANOMALY')
    ORDER BY "resourceId", "createdAt" DESC, "id" DESC`;
  return new Map(rows.map((r) => [r.resourceId, r]));
}
