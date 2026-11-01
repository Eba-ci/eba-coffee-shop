// Mouvements de stock : tableau (desktop) et cartes (mobile). Composant serveur ;
// seul le nom cliquable (filtre par ressource) passe par un lien d'URL.

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { StockMovementRow } from '@/lib/stock-history/queries';
import { ReasonChip } from './reason-chip';

const SOURCE_LABELS = {
  STAFF: 'Équipe',
  MCP: 'Claude / assistant',
  SYSTEM: 'Automatique',
} as const;

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Abidjan',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-muted-foreground">—</span>;
  if (delta === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span
      className={
        delta > 0 ? 'font-semibold text-success' : 'font-semibold text-danger'
      }
    >
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

function Level({ m }: { m: StockMovementRow }) {
  if (m.before === null && m.after === null) {
    return <span className="text-muted-foreground">illimité</span>;
  }
  return (
    <span className="tabular-nums">
      {m.before ?? '∞'} → <strong>{m.after ?? '∞'}</strong>
    </span>
  );
}

function who(m: StockMovementRow): string {
  return m.actorName ?? SOURCE_LABELS[m.source];
}

function resourceHref(m: StockMovementRow): string {
  return `?resource=${encodeURIComponent(m.resourceId)}`;
}

function OrderLink({ m }: { m: StockMovementRow }) {
  if (!m.orderId) return null;
  return (
    <Link
      href={`/dashboard/commandes/${m.orderId}`}
      className="text-primary underline-offset-2 hover:underline"
    >
      Commande {m.orderNumber ? `n°${m.orderNumber}` : ''}
    </Link>
  );
}

export function MovementsTable({
  movements,
}: {
  movements: StockMovementRow[];
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Produit / goût</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead className="text-right">Variation</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Qui · Quoi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {dateFmt.format(m.createdAt)}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={resourceHref(m)}
                    className="hover:underline"
                    title="Voir tout l’historique de cet élément"
                  >
                    {m.label}
                  </Link>
                  <div className="text-xs font-normal text-muted-foreground">
                    {m.kind === 'OPTION' ? 'Goût / option' : 'Produit'}
                  </div>
                </TableCell>
                <TableCell>
                  <ReasonChip reason={m.reason} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Delta delta={m.delta} />
                </TableCell>
                <TableCell className="text-sm">
                  <Level m={m} />
                </TableCell>
                <TableCell className="text-sm">
                  <div>{who(m)}</div>
                  <div className="text-xs">
                    <OrderLink m={m} />
                  </div>
                  {m.note && (
                    <div className="text-xs text-muted-foreground">
                      {m.note}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {movements.map((m) => (
          <li key={m.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={resourceHref(m)}
                className="py-1 font-medium hover:underline"
              >
                {m.label}
              </Link>
              <Delta delta={m.delta} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ReasonChip reason={m.reason} />
              <Level m={m} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {dateFmt.format(m.createdAt)} · {who(m)}
            </div>
            <div className="text-xs">
              <OrderLink m={m} />
            </div>
            {m.note && (
              <div className="text-xs text-muted-foreground">{m.note}</div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
