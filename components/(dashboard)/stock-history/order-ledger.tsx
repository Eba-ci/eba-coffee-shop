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
import { MovementsDetails, StockLines } from './ledger-lines';
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

const isJudged = (o: LedgerOrder) =>
  o.explanation.tone === 'danger' || o.explanation.tone === 'warn';

function OrderCell({ order }: { order: LedgerOrder }) {
  return (
    <>
      <Link
        href={`/dashboard/commandes/${order.id}`}
        className="inline-block py-1 font-medium text-primary underline-offset-2 hover:underline"
      >
        {order.reference}
      </Link>
      <div className="text-sm">{order.customerName ?? 'Sans nom'}</div>
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
              <TableHead>Stock retiré</TableHead>
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
                  <StockLines
                    lines={o.lines}
                    movements={o.movements}
                    judged={isJudged(o)}
                  />
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <VerdictChip explanation={o.explanation} />
                </TableCell>
                <TableCell>
                  <MovementsDetails movements={o.movements} />
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
            <StockLines
              lines={o.lines}
              movements={o.movements}
              judged={isJudged(o)}
            />
            <VerdictChip explanation={o.explanation} />
            <MovementsDetails movements={o.movements} />
          </li>
        ))}
      </ul>
    </>
  );
}
