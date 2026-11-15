import { Suspense } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { requireStats } from '@/lib/auth-helpers';
import { previousRange } from '@/lib/stats-compare';
import { getEarliestOrderDate } from '@/lib/stats';
import {
  formatLocalDateOnly,
  parseDateOnlyToUTC,
  todayDateString,
  shiftDateString,
} from '@/lib/timezone';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/(dashboard)/date-range-filter';
import {
  KpiGridSkeleton,
  ChartCardSkeleton,
} from '@/components/(dashboard)/skeletons';
import { KpiSection } from './_components/kpi-section';
import { RevenueTrendSection } from './_components/revenue-trend-section';
import { PeakHoursSection } from './_components/peak-hours-section';
import { BreakdownsSection } from './_components/breakdowns-section';
import { KitchenSection } from './_components/kitchen-section';
import { CustomersSection } from './_components/customers-section';
import { InvestmentsSection } from './_components/investments-section';
import { RefundsSection } from './_components/refunds-section';

export const dynamic = 'force-dynamic';

const DEFAULT_RANGE_DAYS = 30;

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; range?: string }>;
}) {
  await requireStats();
  const params = await searchParams;

  const isAll = params.range === 'all';
  const today = todayDateString();
  const defaultFrom = shiftDateString(today, -(DEFAULT_RANGE_DAYS - 1));

  let fromStr: string;
  let toStr: string;
  if (isAll) {
    const earliest = await getEarliestOrderDate();
    fromStr = earliest ? formatLocalDateOnly(earliest) : defaultFrom;
    toStr = today;
  } else {
    fromStr = parseDateOnlyToUTC(params.from) ? params.from! : defaultFrom;
    toStr = parseDateOnlyToUTC(params.to) ? params.to! : today;
    if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];
  }

  const from = parseDateOnlyToUTC(fromStr)!;
  const to = parseDateOnlyToUTC(toStr)!;
  // Calculée localement (sync, pas de fetch) : le sous-titre n'a pas besoin
  // d'attendre `compareRangesCached` (streamé dans kpi-section). Sans objet
  // en mode "Tout" (pas de période de référence avant la 1ère commande).
  const { from: previousFrom, to: previousTo } = previousRange(from, to);
  // fromStr/toStr sont toujours des bornes concrètes (même en mode "Tout",
  // résolu ci-dessus à la 1ère commande) : tous les exports peuvent les
  // utiliser directement. `all=1` indique au rapport bancaire de ne pas
  // afficher de comparaison vs période précédente.
  const exportSp = `from=${fromStr}&to=${toStr}`;
  const bankReportSp = isAll ? `${exportSp}&all=1` : exportSp;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Statistiques</h1>
          <p className="text-sm text-muted-foreground">
            {isAll ? (
              <>
                Depuis le début · {fromStr} → {toStr}
              </>
            ) : (
              <>
                Du {fromStr} au {toStr} · comparé du{' '}
                {formatLocalDateOnly(previousFrom)} au{' '}
                {formatLocalDateOnly(previousTo)}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            from={fromStr}
            to={toStr}
            isAll={isAll}
            allowAll={true}
            presets={[
              { label: '7 jours', days: 7 },
              { label: '30 jours', days: 30 },
              { label: '90 jours', days: 90 },
              { label: 'Ce mois-ci', kind: 'month' },
              { label: 'Cette année', kind: 'year' },
            ]}
          />
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export/daily?${exportSp}`}>
              <Download className="mr-1.5 h-4 w-4" />
              Récap journalier
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export/orders?${exportSp}`}>
              <Download className="mr-1.5 h-4 w-4" />
              Commandes
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export/bank-report?${bankReportSp}`}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Rapport bancaire
            </a>
          </Button>
        </div>
      </div>

      <Suspense fallback={<KpiGridSkeleton count={6} cols={3} />}>
        <KpiSection from={from} to={to} />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton height={300} />}>
        <RevenueTrendSection from={from} to={to} />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton height={300} />}>
        <PeakHoursSection from={from} to={to} />
      </Suspense>

      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ChartCardSkeleton height={260} />
              <ChartCardSkeleton height={260} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ChartCardSkeleton height={260} />
              <ChartCardSkeleton height={260} />
            </div>
          </div>
        }
      >
        <BreakdownsSection from={from} to={to} />
      </Suspense>

      <Suspense
        fallback={
          <div className="space-y-3">
            <KpiGridSkeleton count={3} cols={3} />
            <ChartCardSkeleton height={260} />
          </div>
        }
      >
        <KitchenSection from={from} to={to} />
      </Suspense>

      <Suspense
        fallback={
          <div className="space-y-3">
            <KpiGridSkeleton count={5} cols={3} />
            <ChartCardSkeleton height={200} />
          </div>
        }
      >
        <CustomersSection from={from} to={to} />
      </Suspense>

      <Suspense
        fallback={
          <div className="space-y-3">
            <KpiGridSkeleton count={4} cols={4} />
            <ChartCardSkeleton height={200} />
          </div>
        }
      >
        <RefundsSection from={from} to={to} />
      </Suspense>

      <Suspense
        fallback={
          <div className="space-y-3">
            <KpiGridSkeleton count={2} cols={3} />
            <ChartCardSkeleton height={260} />
          </div>
        }
      >
        <InvestmentsSection from={from} to={to} />
      </Suspense>
    </div>
  );
}
