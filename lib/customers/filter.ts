// Filtre d'une page de clients, en SQL : recherche (pg_trgm), tri et pagination
// se font dans PostgreSQL, jamais en mémoire (`list.ts` : une requête pour les
// lignes — chiffres par client inclus —, une pour le total). Ici, la sélection de
// la page ; les chiffres sont joints ensuite aux seules lignes retenues.

import { Prisma } from '@/generated/prisma/client';
import { trgmSearch } from '@/lib/search/trgm';
import {
  ORDERS_PAGE_SIZE,
  REGULAR_CUSTOMER_MIN_DAYS,
} from '@/config/constants';
import type { CustomerSortKey, SortDir } from './types';
import {
  COUNTED_ORDER,
  REFUND_DEDUCTED,
  sinceOrder,
  sinceRefund,
} from './stats-rules';
import { viewDefaultSort, type CustomerView } from './views';

export const STATS_SORT_KEYS: readonly CustomerSortKey[] = [
  'ordersCount',
  'totalSpent',
  'lastOrderAt',
];

/**
 * Nom (similarité trigramme, cf. lib/search/trgm.ts) OU chiffres saisis dans le
 * téléphone. Un téléphone qui correspond classe en tête (score 1).
 */
function searchClause(term: string) {
  const byName = trgmSearch(term, [{ sql: Prisma.sql`c.name` }]);
  const digits = term.replace(/\D/g, '');
  const byPhone = digits
    ? Prisma.sql`c.phone LIKE ${`%${digits}%`}::text`
    : null;
  const clauses = [byName?.where && Prisma.sql`(${byName.where})`, byPhone];
  const where = Prisma.join(
    clauses.filter((c): c is Prisma.Sql => c != null),
    ' OR '
  );
  const score = Prisma.sql`GREATEST(${byName?.score ?? Prisma.sql`0::float8`}, ${
    byPhone
      ? Prisma.sql`CASE WHEN ${byPhone} THEN 1::float8 ELSE 0::float8 END`
      : Prisma.sql`0::float8`
  })`;
  return { where, score };
}

// Agrégats de commandes et de remboursements de TOUS les clients (règles :
// stats-rules.ts). Joints seulement quand le tri porte sur une stat : il faut alors
// classer tous les clients. Sinon, les chiffres sont calculés pour la seule page
// (`STATS_LATERAL`, stats.ts).
export const statsJoin = (since?: Date) => Prisma.sql`
  LEFT JOIN (
    SELECT o."customerId", COUNT(*)::int AS orders, SUM(o.total)::int AS gross,
           MAX(o."createdAt") AS last_order, MIN(o."createdAt") AS first_order,
           COUNT(DISTINCT o."createdAt"::date)::int AS days
    FROM "order" o
    WHERE o."customerId" IS NOT NULL AND ${COUNTED_ORDER} ${sinceOrder(since)}
    GROUP BY o."customerId"
  ) s ON s."customerId" = c.id
  LEFT JOIN (
    SELECT r."customerId", SUM(r.amount)::int AS refunded
    FROM refund r JOIN "order" ro ON ro.id = r."orderId"
    WHERE r."customerId" IS NOT NULL AND ${REFUND_DEDUCTED} ${sinceRefund(since)}
    GROUP BY r."customerId"
  ) rf ON rf."customerId" = c.id`;

function orderBy(
  sort: CustomerSortKey | undefined,
  dir: SortDir,
  relevance?: Prisma.Sql
) {
  const d = dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const tieBreak = Prisma.sql`c."createdAt" DESC, c.id`;
  switch (sort) {
    case 'name':
      return Prisma.sql`ORDER BY c.name ${d} NULLS LAST, ${tieBreak}`;
    case 'ordersCount':
      return Prisma.sql`ORDER BY COALESCE(s.orders, 0) ${d}, ${tieBreak}`;
    case 'totalSpent':
      return Prisma.sql`ORDER BY (COALESCE(s.gross, 0) - COALESCE(rf.refunded, 0)) ${d}, ${tieBreak}`;
    case 'lastOrderAt':
      return Prisma.sql`ORDER BY s.last_order ${d} NULLS LAST, ${tieBreak}`;
    default:
      return relevance
        ? Prisma.sql`ORDER BY ${relevance} DESC, ${tieBreak}`
        : Prisma.sql`ORDER BY ${tieBreak}`;
  }
}

/** Paramètres de la page : ceux de l'URL (cf. `clients/search-params.ts`). */
export type CustomerQuery = {
  search?: string;
  page?: number;
  sort?: CustomerSortKey;
  dir?: SortDir;
  /** Vue rapide : ne garde que les clients qui ont commandé (et, pour `reguliers`, assez de jours). */
  view?: CustomerView;
  /** Borne de la période des chiffres (commandes créées depuis). Sans elle : tout. */
  since?: Date;
};

/** Condition de la vue : `s` = agrégats par client (jamais appelée sans la jointure). */
function viewClause(view: CustomerView) {
  return view === 'reguliers'
    ? Prisma.sql`COALESCE(s.days, 0) >= ${REGULAR_CUSTOMER_MIN_DAYS}`
    : Prisma.sql`COALESCE(s.orders, 0) > 0`;
}

/**
 * Fragments SQL du filtre : `where` (le total), `from` (+ agrégats de tous les
 * clients SI le tri porte sur une stat), `orderBy` et `limit` (la page). `orderBy`
 * est exposé à part parce que `list.ts` le rejoue après avoir joint les chiffres.
 */
export function customerFilter({
  search: term,
  page = 1,
  sort: requestedSort,
  dir = 'desc',
  view,
  since,
}: CustomerQuery) {
  const search = term?.trim() ? searchClause(term.trim()) : null;
  const sort = requestedSort ?? viewDefaultSort(view);
  const conditions = [
    search ? Prisma.sql`(${search.where})` : null,
    view ? viewClause(view) : null,
  ].filter((c): c is Prisma.Sql => c != null);
  const where = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty;
  // Les agrégats de TOUS les clients ne sont joints que s'il faut les classer
  // ou les filtrer (tri sur une stat, vue). Sinon : seulement pour la page.
  const needsJoin = view != null || (sort && STATS_SORT_KEYS.includes(sort));
  const join = needsJoin ? statsJoin(since) : Prisma.empty;
  const skip = (Math.max(1, page) - 1) * ORDERS_PAGE_SIZE;
  return {
    from: Prisma.sql`FROM customer c ${join} ${where}`,
    // Le total n'a besoin de la jointure que si la vue filtre dessus.
    countFrom: Prisma.sql`FROM customer c ${view ? join : Prisma.empty} ${where}`,
    orderBy: orderBy(sort, dir, search?.score),
    limit: Prisma.sql`LIMIT ${ORDERS_PAGE_SIZE} OFFSET ${skip}`,
  };
}
