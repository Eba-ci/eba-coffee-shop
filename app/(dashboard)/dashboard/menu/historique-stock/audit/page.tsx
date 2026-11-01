import Link from 'next/link';
import { DateRangeFilter } from '@/components/(dashboard)/date-range-filter';
import { OrderLedger } from '@/components/(dashboard)/stock-history/order-ledger';
import { ROLE_GROUPS, requireRoleOrAnalyst } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import {
  AUDIT_ORDER_LIMIT,
  loadOrderLedger,
} from '@/lib/stock-history/order-audit-query';
import {
  parseStockHistorySearchParams,
  type StockHistorySearchParams,
} from '../parse-search-params';

export const dynamic = 'force-dynamic';

const dayFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Abidjan',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Conserve les filtres de l'URL pour basculer d'une vue à l'autre. */
function viewHref(params: StockHistorySearchParams, vue: 'tout' | null) {
  const sp = new URLSearchParams();
  for (const key of ['resource', 'from', 'to', 'range']) {
    const v = first(params[key]);
    if (v) sp.set(key, v);
  }
  if (vue) sp.set('vue', vue);
  const qs = sp.toString();
  return `/dashboard/menu/historique-stock/audit${qs ? `?${qs}` : ''}`;
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'danger' | 'warning';
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          tone === 'danger' && value > 0
            ? 'text-2xl font-bold text-danger'
            : tone === 'warning' && value > 0
              ? 'text-2xl font-bold text-warning'
              : 'text-2xl font-bold'
        }
      >
        {value}
      </div>
    </div>
  );
}

export default async function StockAuditPage({
  searchParams,
}: {
  searchParams: Promise<StockHistorySearchParams>;
}) {
  // Lecture seule : l'analyste peut auditer, jamais corriger.
  await requireRoleOrAnalyst(ROLE_GROUPS.MENU);

  const params = await searchParams;
  const p = parseStockHistorySearchParams(params);
  const all = first(params.vue) === 'tout';

  const [ledger, product] = await Promise.all([
    loadOrderLedger(
      {
        productId: p.resourceId,
        from: p.dateFrom,
        toExclusive: p.dateToExclusive,
        onlyIssues: !all,
      },
      'audit'
    ),
    p.resourceId
      ? prisma.product.findUnique({
          where: { id: p.resourceId },
          select: { name: true },
        })
      : null,
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/dashboard/menu/historique-stock"
          className="inline-block py-1 text-sm text-primary underline-offset-2 hover:underline"
        >
          ← Historique du stock
        </Link>
        <h1 className="text-2xl font-bold">Audit du stock par commande</h1>
        <p className="text-sm text-muted-foreground">
          Pour chaque commande lancée en cuisine, on compare ce que la commande
          devait décompter à ce que le journal a réellement décompté. Une
          commande lancée ou servie sans décompte est le signe d’un stock qui ne
          baisse pas, donc d’un risque de double vente.
        </p>
        <p className="text-xs text-muted-foreground">
          {ledger.journalStart
            ? `Journal complet depuis le ${dayFmt.format(ledger.journalStart)} : les commandes lancées avant ne peuvent pas être jugées.`
            : 'Le journal n’a enregistré aucune vente pour l’instant : rien ne peut encore être jugé.'}
          {product ? ` Produit : ${product.name}.` : ''}
        </p>
      </div>

      <DateRangeFilter from={p.fromStr} to={p.toStr} isAll={p.isAll} allowAll />

      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        <Kpi label="Commandes examinées" value={ledger.examined} />
        <Kpi label="À vérifier" value={ledger.defects} tone="danger" />
        <Kpi label="Avertissements" value={ledger.warnings} tone="warning" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={viewHref(params, null)}
          aria-current={!all ? 'page' : undefined}
          className={
            !all
              ? 'rounded-md bg-muted px-3 py-1.5 font-medium'
              : 'rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground'
          }
        >
          Défauts et avertissements
        </Link>
        <Link
          href={viewHref(params, 'tout')}
          aria-current={all ? 'page' : undefined}
          className={
            all
              ? 'rounded-md bg-muted px-3 py-1.5 font-medium'
              : 'rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground'
          }
        >
          Toutes les commandes lancées
        </Link>
        {p.resourceId && (
          <Link
            href={viewHref(
              { ...params, resource: undefined },
              all ? 'tout' : null
            )}
            className="rounded-md px-3 py-1.5 text-primary hover:underline"
          >
            Retirer le filtre produit
          </Link>
        )}
      </div>

      {ledger.total > AUDIT_ORDER_LIMIT && (
        <p className="text-xs text-muted-foreground">
          {ledger.total} commandes dans la sélection : les {AUDIT_ORDER_LIMIT}{' '}
          plus récentes sont examinées. Resserrez la période pour voir les
          autres.
        </p>
      )}

      {ledger.orders.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          {all
            ? 'Aucune commande lancée sur cette sélection.'
            : 'Aucun défaut ni avertissement : chaque commande examinée a bien décompté son stock.'}
        </p>
      ) : (
        <OrderLedger
          orders={ledger.orders}
          showProductQuantity={Boolean(p.resourceId)}
        />
      )}
    </div>
  );
}
