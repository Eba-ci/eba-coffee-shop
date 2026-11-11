'use client';

import dynamic from 'next/dynamic';
import {
  hasNoThreshold,
  type BreakEvenChartPoint,
} from '@/lib/fixed-costs/chart';
import { ChartEmpty } from './chart-empty';
import { ChartSkeleton } from './chart-skeleton';

const Chart = dynamic(
  () => import('./break-even-chart.client').then((m) => m.BreakEvenChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
);

/** CA net du jour contre point mort (charges ÷ marge). */
export function BreakEvenChart({ data }: { data: BreakEvenChartPoint[] }) {
  if (data.length === 0) {
    return (
      <ChartEmpty className="h-[240px]">Aucun jour sur la période.</ChartEmpty>
    );
  }
  if (hasNoThreshold(data)) {
    return (
      <ChartEmpty className="h-[240px]">
        Seuil indisponible : coûts de revient manquants sur les commandes.
      </ChartEmpty>
    );
  }
  return <Chart data={data} />;
}
