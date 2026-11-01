import { ROLE_GROUPS, requireRoleOrAnalyst } from '@/lib/auth-helpers';
import { Pagination } from '@/components/(dashboard)/pagination';
import { runStockAudit } from '@/lib/stock-history/audit';
import {
  getResourceLabel,
  getStockMovementSummary,
  listStockMovements,
} from '@/lib/stock-history/queries';
import { AuditPanel } from './_components/audit-panel';
import { HistoryToolbar } from './_components/history-toolbar';
import { MovementsTable } from './_components/movements-table';
import { ReasonSummary } from './_components/reason-summary';
import {
  parseStockHistorySearchParams,
  type StockHistorySearchParams,
} from './parse-search-params';

export const dynamic = 'force-dynamic';

export default async function StockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<StockHistorySearchParams>;
}) {
  // Lecture seule : l'analyste peut consulter, jamais corriger.
  const session = await requireRoleOrAnalyst(ROLE_GROUPS.MENU);
  const canFix = ROLE_GROUPS.MANAGER_PLUS.includes(session.user.role);

  const p = parseStockHistorySearchParams(await searchParams);
  const filters = {
    from: p.dateFrom,
    toExclusive: p.dateToExclusive,
    reasons: p.reason ? [p.reason] : undefined,
    source: p.source,
    search: p.search,
    resourceId: p.resourceId,
    orderId: p.orderId,
  };

  const [list, summary, audit, resourceLabel] = await Promise.all([
    listStockMovements({ ...filters, page: p.page }),
    getStockMovementSummary(filters),
    runStockAudit(),
    p.resourceId ? getResourceLabel(p.resourceId) : undefined,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historique du stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chaque mouvement de stock des produits et des goûts : ventes,
          réservations, réapprovisionnements, réglages, remboursements. Qui,
          quand, pourquoi, et pour quelle commande.
          {' · '}
          {list.total} mouvement{list.total > 1 ? 's' : ''}
        </p>
      </div>

      <AuditPanel audit={audit} canFix={canFix} />

      <HistoryToolbar
        from={p.fromStr}
        to={p.toStr}
        isAll={p.isAll}
        resourceLabel={resourceLabel}
      />

      <ReasonSummary rows={summary} />

      {list.movements.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Aucun mouvement ne correspond à ces filtres.
        </p>
      ) : (
        <MovementsTable movements={list.movements} />
      )}

      {list.totalPages > 1 && <Pagination totalPages={list.totalPages} />}
    </div>
  );
}
