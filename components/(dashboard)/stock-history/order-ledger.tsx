// « Quelle commande a pris quel stock » : une ligne par commande avec ce que le
// journal a réellement décompté (produit, goûts, suppléments), le verdict du
// contrôle et le détail des mouvements. Composant serveur, sans bouton : il se
// glisse aussi dans le formulaire produit (onglet « Stock ») sans le soumettre.

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LedgerOrder } from '@/lib/stock-history/order-audit-query';
import type { ResourceLine } from '@/lib/stock-history/order-audit';
import { STOCK_REASON_LABELS } from '@/lib/stock-history/types';
import { VerdictChip } from './verdict-chip';

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nouvelle',
  PREPARING: 'En cours',
  READY: 'Prête',
  COMPLETED: 'Récupérée',
  CANCELLED: 'Annulée',
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Abidjan',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const LINE_TONE: Record<ResourceLine['status'], string> = {
  ok: 'text-foreground',
  missing: 'font-semibold text-danger',
  excess: 'font-semibold text-warning',
};

/**
 * Les écarts ne se colorent que pour une commande JUGÉE : pour une commande non
 * lancée, différée ou antérieure au journal, « 0 / 1 » est normal, pas une alerte.
 */
function Lines({
  lines,
  emphasize,
}: {
  lines: ResourceLine[];
  emphasize: boolean;
}) {
  if (lines.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {lines.map((l) => (
        <li
          key={`${l.kind}:${l.resourceId}`}
          className={emphasize ? LINE_TONE[l.status] : undefined}
          title={
            !emphasize || l.status === 'ok'
              ? undefined
              : `Attendu ${l.needed}, décompté ${l.consumed}`
          }
        >
          {l.label}{' '}
          <span className="tabular-nums">
            {l.consumed}/{l.needed}
          </span>
        </li>
      ))}
    </ul>
  );
}

const isJudged = (o: LedgerOrder) =>
  o.explanation.tone === 'danger' || o.explanation.tone === 'warn';

function Movements({ order }: { order: LedgerOrder }) {
  if (order.movements.length === 0) {
    return <span className="text-xs text-muted-foreground">Aucun</span>;
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer select-none py-1 text-xs text-primary">
        {order.movements.length} mouvement
        {order.movements.length > 1 ? 's' : ''}
      </summary>
      <ul className="mt-1 space-y-1">
        {order.movements.map((m) => (
          <li key={m.id} className="text-xs">
            <span className="tabular-nums text-muted-foreground">
              {dateFmt.format(m.createdAt)}
            </span>{' '}
            {m.label} ·{' '}
            <span
              className={
                (m.delta ?? 0) < 0
                  ? 'font-semibold text-danger'
                  : 'font-semibold text-success'
              }
            >
              {(m.delta ?? 0) > 0 ? `+${m.delta}` : (m.delta ?? 0)}
            </span>{' '}
            · {STOCK_REASON_LABELS[m.reason]}
            {m.actorName ? ` · ${m.actorName}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}

function OrderCell({ order }: { order: LedgerOrder }) {
  return (
    <>
      <Link
        href={`/dashboard/commandes/${order.id}`}
        className="inline-block py-1 font-medium text-primary underline-offset-2 hover:underline"
      >
        Commande n°{order.dailyNumber}
      </Link>
      <div className="text-xs text-muted-foreground">
        {dateFmt.format(order.createdAt)} ·{' '}
        {STATUS_LABELS[order.status] ?? order.status}
        {order.isPaid ? ' · payée' : ''}
      </div>
    </>
  );
}

export function OrderLedger({
  orders,
  showProductQuantity = false,
}: {
  orders: LedgerOrder[];
  showProductQuantity?: boolean;
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Commande</TableHead>
              {showProductQuantity && (
                <TableHead className="text-right">Qté</TableHead>
              )}
              <TableHead>Stock décompté / attendu</TableHead>
              <TableHead>Contrôle</TableHead>
              <TableHead>Détail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <OrderCell order={o} />
                </TableCell>
                {showProductQuantity && (
                  <TableCell className="text-right tabular-nums">
                    {o.productQuantity}
                  </TableCell>
                )}
                <TableCell>
                  <Lines lines={o.lines} emphasize={isJudged(o)} />
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <VerdictChip explanation={o.explanation} />
                </TableCell>
                <TableCell>
                  <Movements order={o} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {orders.map((o) => (
          <li key={o.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <OrderCell order={o} />
            {showProductQuantity && (
              <div className="text-xs text-muted-foreground">
                Quantité : {o.productQuantity}
              </div>
            )}
            <Lines lines={o.lines} emphasize={isJudged(o)} />
            <VerdictChip explanation={o.explanation} />
            <Movements order={o} />
          </li>
        ))}
      </ul>
    </>
  );
}
