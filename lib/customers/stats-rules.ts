// Règles de calcul des stats client, en SQL — définies UNE fois, utilisées par la
// requête de stats de la page (`stats.ts`) et par le tri sur une stat
// (`filter.ts`). Alias attendus : `o` (order), `r` (refund), `ro` (order du refund).

import { Prisma } from '@/generated/prisma/client';

/**
 * Commande comptée dans les stats client : non annulée et visible du staff (une
 * commande en ligne jamais payée n'existe pas pour le CRM, cf. `STAFF_VISIBLE`).
 *
 * ⚠ Le prédicat doit rester IDENTIQUE à celui de l'index partiel
 * `order_customer_counted_idx` (prisma/sql/order-customer-counted-index.sql) :
 * Postgres n'utilise un index partiel que si la requête implique son prédicat.
 */
export const COUNTED_ORDER = Prisma.sql`o.status <> 'CANCELLED' AND (o."paymentExpiresAt" IS NULL OR o."isPaid")`;

/**
 * Remboursement déduit du total acheté : payé, hors conversion d'avoir (l'avoir a
 * déjà retiré le CA), sur une commande non annulée (déjà exclue du total).
 */
export const REFUND_DEDUCTED = Prisma.sql`r.status = 'PAID' AND r."creditSourceId" IS NULL AND ro.status <> 'CANCELLED'`;

/**
 * Fenêtre de période (vues « Meilleurs / Plus fidèles / Réguliers ») : commandes
 * créées depuis `since`. Clause À PART de `COUNTED_ORDER`, dont le prédicat doit
 * rester identique à celui de l'index partiel. Sans `since` : tout l'historique.
 */
export const sinceOrder = (since?: Date) =>
  since ? Prisma.sql`AND o."createdAt" >= ${since}` : Prisma.empty;

/** Même fenêtre côté remboursements : on rattache le remboursement à sa commande (`ro`). */
export const sinceRefund = (since?: Date) =>
  since ? Prisma.sql`AND ro."createdAt" >= ${since}` : Prisma.empty;
