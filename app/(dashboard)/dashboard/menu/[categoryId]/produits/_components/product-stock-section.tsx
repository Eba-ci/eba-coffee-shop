// Onglet « Stock » de la fiche produit : stock actuel du produit et de ses goûts,
// puis la réponse à « quelle commande a pris quel stock ? » (commandes qui
// contiennent le produit, ce que le journal a décompté, verdict du contrôle).
// Composant serveur lu dans le formulaire : aucun bouton, que des liens.

import Link from 'next/link';
import { StockBadge } from '@/components/(dashboard)/stock-badge';
import { OrderLedger } from '@/components/(dashboard)/stock-history/order-ledger';
import { ReasonSummary } from '@/components/(dashboard)/stock-history/reason-summary';
import { getLastMovements } from '@/lib/stock-history/last-movements';
import { loadOrderLedger } from '@/lib/stock-history/order-audit-query';
import { getStockMovementSummary } from '@/lib/stock-history/queries';
import { STOCK_REASON_LABELS } from '@/lib/stock-history/types';

const LEDGER_LIMIT = 50;

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Abidjan',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export type StockSectionOption = {
  id: string;
  groupName: string;
  name: string;
  stockQuantity: number | null;
};

export async function ProductStockSection({
  productId,
  stockQuantity,
  options,
}: {
  productId: string;
  stockQuantity: number | null;
  options: StockSectionOption[];
}) {
  const [ledger, summary, last] = await Promise.all([
    loadOrderLedger({ productId, limit: LEDGER_LIMIT }, 'product'),
    getStockMovementSummary({ resourceId: productId }),
    getLastMovements([productId, ...options.map((o) => o.id)]),
  ]);

  const lastText = (id: string) => {
    const m = last.get(id);
    if (!m) return 'Aucun mouvement';
    const delta = m.delta ?? 0;
    return `${delta > 0 ? `+${delta}` : delta} · ${STOCK_REASON_LABELS[m.reason]} · ${dateFmt.format(m.createdAt)}`;
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2" aria-label="Stock actuel">
        <h2 className="text-sm font-semibold">Stock actuel</h2>
        <ul className="divide-y rounded-lg border text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="font-medium">Produit</span>
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {lastText(productId)}
              </span>
              <StockBadge stockQuantity={stockQuantity} />
            </span>
          </li>
          {options.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <span>
                <span className="text-muted-foreground">{o.groupName} · </span>
                {o.name}
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {lastText(o.id)}
                </span>
                <StockBadge stockQuantity={o.stockQuantity} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <ReasonSummary rows={summary} />

      <section className="space-y-3" aria-label="Commandes et stock">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">
              Quelle commande a pris quel stock
            </h2>
            <p className="text-xs text-muted-foreground">
              {ledger.total} commande{ledger.total > 1 ? 's' : ''} contiennent
              ce produit
              {ledger.total > LEDGER_LIMIT
                ? ` — les ${LEDGER_LIMIT} plus récentes ci-dessous`
                : ''}
              . Le stock se décompte au lancement en cuisine.
              {ledger.defects > 0 && (
                <>
                  {' '}
                  <strong className="text-danger">
                    {ledger.defects} commande{ledger.defects > 1 ? 's' : ''} à
                    vérifier.
                  </strong>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href={`/dashboard/menu/historique-stock?resource=${productId}`}
              className="py-1.5 text-primary underline-offset-2 hover:underline"
            >
              Tous les mouvements
            </Link>
            <Link
              href={`/dashboard/menu/historique-stock/audit?resource=${productId}`}
              className="py-1.5 text-primary underline-offset-2 hover:underline"
            >
              Audit de ce produit
            </Link>
          </div>
        </div>

        {ledger.orders.length === 0 ? (
          <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            Aucune commande ne contient encore ce produit.
          </p>
        ) : (
          <OrderLedger orders={ledger.orders} showProductQuantity />
        )}
      </section>
    </div>
  );
}
