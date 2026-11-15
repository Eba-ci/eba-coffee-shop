// Section KPIs de la page Statistiques : compareRangesCached (dédupliqué
// avec breakdowns-section) + récap des régularisations, en parallèle
// (indépendants). JSX déplacé tel quel depuis page.tsx.

import {
  Banknote,
  ClipboardList,
  ShoppingBasket,
  TrendingDown,
  Wallet,
  XCircle,
} from 'lucide-react';
import { compareRangesCached } from '@/lib/stats-compare';
import { getRevenueAdjustmentSummary } from '@/lib/revenue-adjustments';
import { KpiCard } from '@/components/(dashboard)/kpi-card';

const priceFormatter = new Intl.NumberFormat('fr-FR');

export async function KpiSection({ from, to }: { from: Date; to: Date }) {
  const [comparison, adjustmentSummary] = await Promise.all([
    compareRangesCached(from, to),
    getRevenueAdjustmentSummary(from, to),
  ]);

  const stats = comparison.current;
  const { deltas } = comparison;
  // La marge nette d'exploitation reste CA − dépenses : les investissements
  // (apports/financements) sont du capital, suivis dans un bloc séparé. Le CA
  // (stats.revenue) est NET : régularisations incluses, remboursements déduits.
  const netMargin = stats.revenue - comparison.expenses.current.total;
  const netMarginPct = stats.revenue > 0 ? netMargin / stats.revenue : null;
  const rangeDays =
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const vsLabel =
    rangeDays === 1
      ? 'vs veille'
      : `vs ${priceFormatter.format(rangeDays)} j précédents`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <KpiCard
        label="CA encaissé"
        value={`${priceFormatter.format(stats.revenue)} F`}
        Icon={Banknote}
        delta={{ pct: deltas.revenue.pct, label: vsLabel }}
        hint={
          [
            stats.refunds > 0
              ? `brut ${priceFormatter.format(stats.grossRevenue)} F · remboursements −${priceFormatter.format(stats.refunds)} F`
              : null,
            adjustmentSummary.total !== 0
              ? `dont régularisations : ${adjustmentSummary.total < 0 ? '−' : '+'}${priceFormatter.format(Math.abs(adjustmentSummary.total))} F`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
      />
      <KpiCard
        label="Dépenses"
        value={`${priceFormatter.format(comparison.expenses.current.total)} F`}
        Icon={Wallet}
        delta={{
          pct: deltas.expenses.pct,
          label: vsLabel,
          goodWhenUp: false,
        }}
        hint={
          comparison.expenses.current.fixed > 0
            ? `fixes : ${priceFormatter.format(comparison.expenses.current.fixed)} F · variables : ${priceFormatter.format(comparison.expenses.current.variable)} F`
            : undefined
        }
      />
      <KpiCard
        label="Marge nette"
        value={`${priceFormatter.format(netMargin)} F`}
        Icon={TrendingDown}
        valueClassName={netMargin < 0 ? 'text-destructive' : 'text-green-600'}
        delta={{ pct: deltas.netMargin.pct, label: vsLabel }}
        hint={
          netMarginPct !== null
            ? `soit ${Math.round(netMarginPct * 100)} % du CA`
            : undefined
        }
      />
      <KpiCard
        label="Commandes"
        value={priceFormatter.format(stats.totalOrders)}
        Icon={ClipboardList}
        delta={{ pct: deltas.totalOrders.pct, label: vsLabel }}
      />
      <KpiCard
        label="Panier moyen"
        value={`${priceFormatter.format(stats.avgBasket)} F`}
        Icon={ShoppingBasket}
        delta={{ pct: deltas.avgBasket.pct, label: vsLabel }}
      />
      <KpiCard
        label="Taux d'annulation"
        value={`${Math.round(stats.cancellationRate * 100)} %`}
        Icon={XCircle}
        delta={{
          pct:
            comparison.previous.totalOrders > 0
              ? deltas.cancellationRatePts.diffPts
              : null,
          label: vsLabel,
          goodWhenUp: false,
          unit: 'pts',
        }}
      />
    </div>
  );
}
