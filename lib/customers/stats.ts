import { Prisma } from '@/generated/prisma/client';
import {
  COUNTED_ORDER,
  REFUND_DEDUCTED,
  sinceOrder,
  sinceRefund,
} from './stats-rules';
import type { CustomerStats } from './types';

export const ZERO_STATS: CustomerStats = {
  ordersCount: 0,
  totalSpent: 0,
  lastOrderAt: null,
};

/**
 * Chiffres d'un client, calculés pour CHAQUE ligne de la sous-requête de page
 * (alias `c`) et pas pour tous les clients : une recherche d'index
 * (`order_customer_counted_idx`, cf. prisma/sql/order-customer-counted-index.sql)
 * par client de la page. Mesuré sur 300 000 commandes : ~2 ms contre ~140 ms pour
 * une jointure sur des agrégats de toute la table. Alias exposés : `s`, `rf`.
 * `since` : ne compte que les commandes créées depuis cette date (vues par période).
 */
export const statsLateral = (since?: Date) => Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS orders, SUM(o.total)::int AS gross,
           MAX(o."createdAt") AS last_order
    FROM "order" o
    WHERE o."customerId" = c.id AND ${COUNTED_ORDER} ${sinceOrder(since)}
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT SUM(r.amount)::int AS refunded
    FROM refund r JOIN "order" ro ON ro.id = r."orderId"
    WHERE r."customerId" = c.id AND ${REFUND_DEDUCTED} ${sinceRefund(since)}
  ) rf ON true`;

/** Colonnes de stats du `SELECT` (avec `STATS_LATERAL`) ; total net des remboursements payés. */
export const STATS_COLUMNS = Prisma.sql`
  COALESCE(s.orders, 0)::int AS "ordersCount",
  (COALESCE(s.gross, 0) - COALESCE(rf.refunded, 0))::int AS "totalSpent",
  s.last_order AS "lastOrderAt"`;
