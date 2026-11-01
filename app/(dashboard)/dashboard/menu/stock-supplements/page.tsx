import { getAllOptionStock } from '@/lib/menu';
import { getPendingOptionDemand } from '@/lib/orders/pending-demand';
import { getLastMovements } from '@/lib/stock-history/last-movements';
import { OptionsStockTable } from './options-stock-table';

// Données live + `OptionsStockTable` lit la recherche dans l'URL
// (`useSearchParams`), ce qui interdit le prérendu statique.
export const dynamic = 'force-dynamic';

export default async function StockSupplementsPage() {
  const [rows, pendingByOption] = await Promise.all([
    getAllOptionStock(),
    getPendingOptionDemand(),
  ]);

  const lastMovements = await getLastMovements(rows.map((r) => r.id));
  const withPending = rows.map((r) => {
    const last = lastMovements.get(r.id);
    return {
      ...r,
      pending: pendingByOption.get(r.id) ?? 0,
      // Date en ISO : la ligne traverse la frontière serveur → client.
      lastMovement: last
        ? {
            delta: last.delta,
            reason: last.reason,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock par goût / option</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toutes les options à stock suivi (« goûts »), tous produits confondus
          — y compris les extras globaux. La colonne « En attente » indique la
          quantité déjà demandée par des commandes NON payées ; le stock
          lui-même n’est décrémenté qu’au paiement (comportement inchangé).
        </p>
      </div>

      <OptionsStockTable rows={withPending} />
    </div>
  );
}
