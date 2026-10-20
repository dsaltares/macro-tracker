'use client';

import { Line, LineChart, XAxis, YAxis } from 'recharts';
import type { PointsShown } from '@/components/body/weight-chart';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  addDays,
  daysBetween,
  formatDay,
  formatDayMonth,
  formatMonthYear,
} from '@/lib/domain/dates';

const chartConfig = {
  weight: { label: 'Weight', color: 'var(--muted-foreground)' },
  trend: { label: 'Trend', color: 'var(--primary)' },
} satisfies ChartConfig;

const daysShownAsMonths = 180;

const toTenth = (kg: number) => Math.round(kg * 10) / 10;

export function WeightTrendChart({ points, first, last }: PointsShown) {
  const formatTick =
    daysBetween(first.date, last.date) > daysShownAsMonths
      ? formatMonthYear
      : formatDayMonth;
  const rows = points.map(({ date, weight, trend }) => ({
    day: daysBetween(first.date, date),
    date,
    weight: toTenth(weight),
    trend: toTenth(trend),
  }));
  const kilograms = points.flatMap(({ weight, trend }) => [weight, trend]);
  const kilogramDomain = [
    Math.floor(Math.min(...kilograms)) - 1,
    Math.ceil(Math.max(...kilograms)) + 1,
  ];

  return (
    <ChartContainer
      aria-hidden
      config={chartConfig}
      className="aspect-auto h-56 w-full"
    >
      <LineChart
        accessibilityLayer={false}
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <XAxis
          dataKey="day"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(day: number) => formatTick(addDays(first.date, day))}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          domain={kilogramDomain}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const date = payload[0]?.payload?.date;
                return typeof date === 'string' ? formatDay(date) : null;
              }}
            />
          }
        />
        <Line
          dataKey="weight"
          stroke="none"
          dot={{ r: 2.5, fill: 'var(--color-weight)', strokeWidth: 0 }}
          activeDot={{ r: 4, fill: 'var(--color-weight)' }}
          isAnimationActive={false}
        />
        <Line
          dataKey="trend"
          type="monotone"
          stroke="var(--color-trend)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
