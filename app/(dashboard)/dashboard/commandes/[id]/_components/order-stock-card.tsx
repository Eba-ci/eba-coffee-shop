// Carte « Stock » du détail d'une commande : ce que cette commande a réellement
// décompté (journal), le verdict du contrôle et l'explication quand rien n'a bougé.

import { VerdictChip } from '@/components/(dashboard)/stock-history/verdict-chip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadOrderLedger } from '@/lib/stock-history/order-audit-query';
import { STOCK_REASON_LABELS } from '@/lib/stock-history/types';
import Link from 'next/link';

const timeFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Abidjan',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export async function OrderStockCard({ orderId }: { orderId: string }) {
  const { orders } = await loadOrderLedger({ orderIds: [orderId] }, 'audit');
  const order = orders[0];
  if (!order) return null;
  // Commande non jugée (non lancée, différée, avant le journal) : « 0 / n » est normal.
  const judged =
    order.explanation.tone === 'danger' || order.explanation.tone === 'warn';

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Stock</CardTitle>
        <VerdictChip explanation={order.explanation} />
      </CardHeader>
      <CardContent className="space-y-3">
        {order.lines.length > 0 && (
          <ul className="space-y-0.5 text-sm">
            {order.lines.map((l) => (
              <li
                key={`${l.kind}:${l.resourceId}`}
                className={
                  !judged
                    ? undefined
                    : l.status === 'missing'
                      ? 'font-semibold text-danger'
                      : l.status === 'excess'
                        ? 'font-semibold text-warning'
                        : undefined
                }
              >
                {l.label}{' '}
                <span className="tabular-nums">
                  décompté {l.consumed} / attendu {l.needed}
                </span>
              </li>
            ))}
          </ul>
        )}
        {order.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun mouvement de stock pour cette commande.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {order.movements.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap justify-between gap-2 py-1.5"
              >
                <span>
                  {m.label} · {STOCK_REASON_LABELS[m.reason]}
                  {m.actorName ? ` · ${m.actorName}` : ''}
                </span>
                <span className="tabular-nums">
                  <span
                    className={
                      (m.delta ?? 0) < 0
                        ? 'font-semibold text-danger'
                        : 'font-semibold text-success'
                    }
                  >
                    {(m.delta ?? 0) > 0 ? `+${m.delta}` : (m.delta ?? 0)}
                  </span>{' '}
                  <span className="text-xs text-muted-foreground">
                    {m.before ?? '∞'} → {m.after ?? '∞'} ·{' '}
                    {timeFmt.format(m.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
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
