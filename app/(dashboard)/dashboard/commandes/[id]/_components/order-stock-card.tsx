// Carte « Stock » du détail d'une commande : l'essentiel pour auditer — ce que
// la commande a retiré du stock, par article, et le verdict du contrôle.
// Les mouvements bruts (heure, motif, personne) sont repliés.

import {
  MovementsDetails,
  StockLines,
} from '@/components/(dashboard)/stock-history/ledger-lines';
import { VerdictChip } from '@/components/(dashboard)/stock-history/verdict-chip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadOrderLedger } from '@/lib/stock-history/order-audit-query';
import Link from 'next/link';

export async function OrderStockCard({ orderId }: { orderId: string }) {
  const { orders } = await loadOrderLedger({ orderIds: [orderId] }, 'audit');
  const order = orders[0];
  if (!order) return null;
  // Commande non jugée (non lancée, différée, avant le journal) : « 0 » est normal.
  const judged =
    order.explanation.tone === 'danger' || order.explanation.tone === 'warn';

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Stock</CardTitle>
        <VerdictChip explanation={order.explanation} />
      </CardHeader>
      <CardContent className="space-y-2">
        {order.lines.length === 0 && order.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun mouvement de stock pour cette commande.
          </p>
        ) : (
          <StockLines
            lines={order.lines}
            movements={order.movements}
            judged={judged}
          />
        )}
        <MovementsDetails movements={order.movements} />
        <Link
          href="/dashboard/menu/historique-stock/audit"
          className="inline-block py-1.5 text-sm text-primary underline-offset-2 hover:underline"
        >
          Audit du stock par commande
        </Link>
      </CardContent>
    </Card>
  );
}
