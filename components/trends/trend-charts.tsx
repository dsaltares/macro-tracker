'use client';

import { Bar, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { nutrientNames } from '@/components/nutrients/nutrient-names';
import { macros } from '@/components/trends/macros';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatDay, formatDayMonth } from '@/lib/domain/dates';
import { goalKind } from '@/lib/domain/goals/drv';
import { progressOf } from '@/lib/domain/goals/progress';
import { rollingAverageDays } from '@/lib/domain/trends/aggregations';

const energyConfig = {
  kcal: { label: 'Energy', color: 'var(--energy)' },
  average: {
    label: `${rollingAverageDays}-day average`,
    color: 'var(--primary)',
  },
  goal: { label: 'Goal', color: 'var(--muted-foreground)' },
} satisfies ChartConfig;

const macroConfig = {
  protein: { label: nutrientNames.protein, color: 'var(--protein)' },
  carbohydrate: {
    label: nutrientNames.carbohydrate,
    color: 'var(--carbohydrate)',
  },
  fat: { label: nutrientNames.fat, color: 'var(--fat)' },
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

const overGoal = ({ kcal, goal }: EnergyRow) =>
  kcal !== null &&
  goal !== null &&
  progressOf(kcal, goal, goalKind('energy_kcal')) === 'over';

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
        <Bar dataKey="kcal" radius={2} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell
              key={row.date}
              fill={overGoal(row) ? 'var(--destructive)' : 'var(--color-kcal)'}
            />
          ))}
        </Bar>
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
