import type { Customer } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { ORDERS_PAGE_SIZE } from '@/config/constants';
import { customerFilter, type CustomerQuery } from './filter';
import { STATS_COLUMNS, statsLateral } from './stats';
import type { CustomerStats } from './types';

type StatsColumns = CustomerStats;

/**
 * Clients de la page décrite par `query` + total. Recherche, tri et pagination
 * sont faits par la base (cf. `filter.ts`) : une requête pour les lignes, une
 * pour le total.
 *
 * `withStats` ajoute à chaque client ses chiffres (`stats` : commandes, total net
 * des remboursements, dernière commande) dans LA MÊME requête : la page est
 * d'abord sélectionnée (filtre + tri + `LIMIT`), puis les chiffres ne sont
 * calculés que pour ces ≤ 20 clients (`STATS_LATERAL`). Sans lui `stats` vaut
 * `null` (la recherche de la caisse reste légère).
 */
export async function listCustomers(
  query: CustomerQuery,
  { withStats = false }: { withStats?: boolean } = {}
) {
  const { countFrom, from, orderBy, limit } = customerFilter(query);
  const pageRows = Prisma.sql`SELECT c.* ${from} ${orderBy} ${limit}`;
  // La jointure ne garantit pas l'ordre de la sous-requête : on le rejoue
  // (20 lignes, mêmes expressions, alias `c` conservé).
  const rowsQuery = withStats
    ? Prisma.sql`SELECT c.*, ${STATS_COLUMNS} FROM (${pageRows}) c ${statsLateral(query.since)} ${orderBy}`
    : pageRows;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<(Customer & Partial<StatsColumns>)[]>(rowsQuery),
    prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS total ${countFrom}`
    ),
  ]);
  const customers = rows.map(
    ({ ordersCount, totalSpent, lastOrderAt, ...c }) => ({
      ...(c as Customer),
      stats: withStats
        ? ({
            ordersCount: ordersCount ?? 0,
            totalSpent: totalSpent ?? 0,
            lastOrderAt: lastOrderAt ?? null,
          } satisfies CustomerStats)
        : null,
    })
  );
  return { customers, total: count[0]?.total ?? 0, pageSize: ORDERS_PAGE_SIZE };
}
