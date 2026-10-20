'use client';

import { Bar, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { nutrientNames } from '@/components/nutrients/nutrient-names';
import { macros } from '@/components/trends/macros';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatDay, formatDayMonth } from '@/lib/domain/dates';
import { rollingAverageDays } from '@/lib/domain/trends/aggregations';

const energyConfig = {
  kcal: { label: 'Energy', color: 'var(--chart-2)' },
  average: {
    label: `${rollingAverageDays}-day average`,
    color: 'var(--primary)',
  },
  goal: { label: 'Goal', color: 'var(--muted-foreground)' },
} satisfies ChartConfig;

const macroConfig = {
  protein: {
    label: nutrientNames.protein,
    theme: {
      light: 'oklch(0.588 0.158 241.966)',
      dark: 'oklch(0.746 0.16 232.661)',
    },
  },
  carbohydrate: {
    label: nutrientNames.carbohydrate,
    theme: {
      light: 'oklch(0.769 0.188 70.08)',
      dark: 'oklch(0.828 0.189 84.429)',
    },
  },
  fat: {
    label: nutrientNames.fat,
    theme: {
      light: 'oklch(0.645 0.246 16.439)',
      dark: 'oklch(0.712 0.194 13.428)',
    },
  },
} satisfies ChartConfig;

const dateTooltip = (
  <ChartTooltipContent
    labelFormatter={(_, payload) => {
      const date = payload[0]?.payload?.date;
      return typeof date === 'string' ? formatDay(date) : null;
    }}
  />
);

const dateAxis = (
  <XAxis
    dataKey="date"
    tickFormatter={formatDayMonth}
    tickLine={false}
    axisLine={false}
    minTickGap={24}
  />
);

export type EnergyRow = {
  date: string;
  kcal: number | null;
  average: number | null;
  goal: number | null;
};

export type MacroRow = { date: string } & Partial<
  Record<(typeof macros)[number], number | null>
>;

export function EnergyChartPlot({ rows }: { rows: readonly EnergyRow[] }) {
  return (
    <ChartContainer
      aria-hidden
      config={energyConfig}
      className="aspect-auto h-56 w-full"
    >
      <ComposedChart
        accessibilityLayer={false}
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        {dateAxis}
        <YAxis tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={dateTooltip} />
        <Bar
          dataKey="kcal"
          fill="var(--color-kcal)"
          radius={2}
          isAnimationActive={false}
        />
        <Line
          dataKey="goal"
          type="stepAfter"
          stroke="var(--color-goal)"
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="average"
          type="monotone"
          stroke="var(--color-average)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

export function MacroChartPlot({ rows }: { rows: readonly MacroRow[] }) {
  return (
    <ChartContainer
      aria-hidden
      config={macroConfig}
      className="aspect-auto h-56 w-full"
    >
      <ComposedChart
        accessibilityLayer={false}
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        {dateAxis}
        <YAxis tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={dateTooltip} />
        {macros.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="macros"
            fill={`var(--color-${key})`}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  );
}
