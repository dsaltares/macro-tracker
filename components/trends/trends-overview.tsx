'use client';

import { IconChevronRight } from '@tabler/icons-react';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { Bar, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { FormError } from '@/components/auth/fields';
import { WeightTrendFigure } from '@/components/body/weight-chart';
import { nutrientNames } from '@/components/nutrients/nutrient-names';
import { formatShare } from '@/components/nutrients/progress';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToday } from '@/components/use-today';
import {
  formatWeeklyRate,
  pointsInRange,
  weeklyRate,
  weightTrend,
} from '@/lib/domain/body/trend';
import { addDays, formatDay, formatDayMonth } from '@/lib/domain/dates';
import { formatAmount, roundAmount } from '@/lib/domain/nutrition/format';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import {
  averageOf,
  loggedAverage,
  rollingAverageDays,
} from '@/lib/domain/trends/aggregations';
import { routes } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';

export const loadFailed = 'Your trends could not be loaded.';

export const trendRangeOptions = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
] as const;

type TrendRangeOption = (typeof trendRangeOptions)[number];

const defaultRange = trendRangeOptions[1];

const macros = ['protein', 'carbohydrate', 'fat'] as const;

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

type Day = {
  date: string;
  logged: boolean;
  totals: NutrientVector;
  rollingAverage: NutrientVector | null;
  goal: NutrientVector | null;
};

const kcal = (vector: NutrientVector | null | undefined) =>
  vector?.energy_kcal === undefined
    ? null
    : roundAmount(vector.energy_kcal, 'kcal');

const grams = (amount: number | undefined) => roundAmount(amount ?? 0, 'g');

const daysLogged = (logged: number, days: number) =>
  `${logged} of ${days} days logged`;

type TrendData = { from: string; to: string; days: readonly Day[] };

const energySummary = (
  { from, to, days }: TrendData,
  average: NutrientVector,
) => {
  const last = days.at(-1);
  const loggedCount = days.filter(({ logged }) => logged).length;
  const goal = averageOf(
    days.flatMap(({ logged, goal }) => (logged && goal ? [goal] : [])),
  );
  const against =
    goal?.energy_kcal === undefined
      ? ''
      : ` against a goal of ${formatAmount(goal.energy_kcal, 'kcal')}`;
  const rolling = last?.rollingAverage?.energy_kcal;
  const lately =
    rolling === undefined
      ? ''
      : ` The ${rollingAverageDays}-day average ends at ${formatAmount(rolling, 'kcal')}.`;
  return (
    `From ${formatDay(from)} to ${formatDay(to)}: ` +
    `${daysLogged(loggedCount, days.length)}, ` +
    `averaging ${formatAmount(average.energy_kcal ?? 0, 'kcal')} a day${against}.${lately}`
  );
};

const macroSummary = (average: NutrientVector) =>
  `On an average logged day: ${macros
    .map(
      (key) =>
        `${nutrientNames[key].toLowerCase()} ${formatAmount(average[key] ?? 0, 'g')}`,
    )
    .join(', ')}.`;

export function TrendsOverview() {
  const trpc = useTRPC();
  const today = useToday();
  const [range, setRange] = useState<TrendRangeOption>(defaultRange);
  const trend = useQuery({
    ...trpc.trends.range.queryOptions(
      today === null
        ? skipToken
        : { from: addDays(today, 1 - range.days), to: today },
    ),
    placeholderData: keepPreviousData,
  });
  const weights = useQuery(
    trpc.body.list.queryOptions({ metric: 'weight_kg' }),
  );

  const content = () => {
    if (trend.isError) {
      return <FormError>{loadFailed}</FormError>;
    }
    if (today === null || trend.isPending) {
      return <p className="text-muted-foreground text-sm">Loading…</p>;
    }
    const days = trend.data.days;
    const average = loggedAverage(days);
    const weightPoints = weights.isSuccess
      ? pointsInRange(weightTrend(weights.data), range, today)
      : [];
    return (
      <>
        <Summary
          days={days}
          average={average}
          adherence={trend.data.adherence}
          rate={weeklyRate(weightPoints)}
        />
        {average === null ? (
          <p className="text-muted-foreground text-sm">
            Nothing logged in the last {range.label}.
          </p>
        ) : (
          <>
            <EnergyChart trend={trend.data} average={average} />
            <MacroChart days={days} average={average} />
          </>
        )}
        <WeightSection
          points={weightPoints}
          rangeLabel={range.label}
          loading={weights.isPending}
        />
      </>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <ToggleGroup
        aria-label="Range"
        variant="outline"
        size="sm"
        spacing={0}
        value={[range.id]}
        onValueChange={([id]) => {
          const chosen = trendRangeOptions.find(
            (candidate) => candidate.id === id,
          );
          if (chosen !== undefined) {
            setRange(chosen);
          }
        }}
      >
        {trendRangeOptions.map(({ id, label }) => (
          <ToggleGroupItem key={id} value={id}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {content()}
    </div>
  );
}

function SummaryItem({ term, children }: { term: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-sm">{term}</dt>
      <dd className="font-semibold text-lg tabular-nums">{children}</dd>
    </div>
  );
}

function Summary({
  days,
  average,
  adherence,
  rate,
}: {
  days: readonly Day[];
  average: NutrientVector | null;
  adherence: number | null;
  rate: number | null;
}) {
  const headingId = useId();
  const loggedCount = days.filter(({ logged }) => logged).length;
  const none = '–';

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-semibold">
          Summary
        </h2>
        <p className="text-muted-foreground text-sm">
          {daysLogged(loggedCount, days.length)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SummaryItem term="Average energy">
          {average === null
            ? none
            : formatAmount(average.energy_kcal ?? 0, 'kcal')}
        </SummaryItem>
        {macros.map((key) => (
          <SummaryItem
            key={key}
            term={`Average ${nutrientNames[key].toLowerCase()}`}
          >
            {average === null ? none : formatAmount(average[key] ?? 0, 'g')}
          </SummaryItem>
        ))}
        <SummaryItem term="Adherence">
          {adherence === null ? none : formatShare(adherence)}
        </SummaryItem>
        <SummaryItem term="Weekly weight rate">
          {rate === null ? none : formatWeeklyRate(rate)}
        </SummaryItem>
      </dl>
      <Link
        href={routes.nutrientReport}
        className="flex min-h-11 items-center gap-1 self-end text-muted-foreground text-sm hover:text-foreground"
      >
        Nutrient report
        <IconChevronRight className="size-4" />
      </Link>
    </section>
  );
}

function ChartSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const headingId = useId();
  const summaryId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id={headingId} className="font-semibold">
        {title}
      </h2>
      <figure className="m-0" aria-labelledby={summaryId}>
        <figcaption id={summaryId} className="sr-only">
          {summary}
        </figcaption>
        {children}
      </figure>
    </section>
  );
}

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

function EnergyChart({
  trend,
  average,
}: {
  trend: TrendData;
  average: NutrientVector;
}) {
  const { days } = trend;
  const rows = useMemo(
    () =>
      days.map(({ date, logged, totals, rollingAverage, goal }) => ({
        date,
        kcal: logged ? kcal(totals) : null,
        average: kcal(rollingAverage),
        goal: kcal(goal),
      })),
    [days],
  );

  return (
    <ChartSection title="Energy" summary={energySummary(trend, average)}>
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
    </ChartSection>
  );
}

function MacroChart({
  days,
  average,
}: {
  days: readonly Day[];
  average: NutrientVector;
}) {
  const rows = useMemo(
    () =>
      days.map(({ date, logged, totals }) => ({
        date,
        ...Object.fromEntries(
          macros.map((key) => [key, logged ? grams(totals[key]) : null]),
        ),
      })),
    [days],
  );

  return (
    <ChartSection title="Macros" summary={macroSummary(average)}>
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
    </ChartSection>
  );
}

function WeightSection({
  points,
  rangeLabel,
  loading,
}: {
  points: ReturnType<typeof pointsInRange>;
  rangeLabel: string;
  loading: boolean;
}) {
  const headingId = useId();
  const first = points.at(0);
  const last = points.at(-1);

  const chart = () => {
    if (loading) {
      return <p className="text-muted-foreground text-sm">Loading…</p>;
    }
    if (first === undefined || last === undefined) {
      return (
        <p className="text-muted-foreground text-sm">
          No weights in the last {rangeLabel}.
        </p>
      );
    }
    return <WeightTrendFigure points={points} first={first} last={last} />;
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="font-semibold">
          Weight
        </h2>
        <Link
          href={routes.body}
          className="flex min-h-11 items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
        >
          Weight log
          <IconChevronRight className="size-4" />
        </Link>
      </div>
      {chart()}
    </section>
  );
}
