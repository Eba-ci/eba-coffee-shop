'use client';

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import { useReducedMotion } from 'framer-motion';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatDay } from '@/lib/fixed-costs/format';
import type { BreakEvenChartPoint } from '@/lib/fixed-costs/chart';

const config = {
  revenue: { label: 'CA net (F)', color: 'var(--chart-1)' },
  breakEven: { label: 'Point mort (F)', color: 'var(--chart-4)' },
} satisfies ChartConfig;

const compactFmt = new Intl.NumberFormat('fr-FR', { notation: 'compact' });
const fullFmt = new Intl.NumberFormat('fr-FR');

export function BreakEvenChart({ data }: { data: BreakEvenChartPoint[] }) {
  const reduced = useReducedMotion();

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-[260px] w-full"
      role="img"
      aria-label="CA net par jour comparé au point mort"
    >
      <ComposedChart data={data} margin={{ left: 8, right: 16 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(d: string) => formatDay(d)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => compactFmt.format(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name) => (
                <span>
                  {config[name as keyof typeof config]?.label ?? name} :{' '}
                  {fullFmt.format(Number(value))} F
                </span>
              )}
            />
          }
          labelFormatter={(label) => formatDay(String(label))}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="revenue"
          radius={[4, 4, 0, 0]}
          isAnimationActive={!reduced}
        >
          {data.map((p) => (
            <Cell
              key={p.date}
              fill="var(--color-revenue)"
              fillOpacity={p.open ? 1 : 0.35}
            />
          ))}
        </Bar>
        <Line
          dataKey="breakEven"
          type="stepAfter"
          stroke="var(--color-breakEven)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          isAnimationActive={!reduced}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
