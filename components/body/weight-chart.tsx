'use client';

import { useId, useMemo, useState } from 'react';
import { Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatWeight } from '@/lib/domain/body/measurements';
import {
  type DatedWeight,
  formatWeeklyRate,
  pointsInRange,
  type TrendPoint,
  type TrendRange,
  trendRanges,
  weeklyRate,
  weightTrend,
} from '@/lib/domain/body/trend';
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

const defaultRange = trendRanges[1];

const daysShownAsMonths = 180;

const toTenth = (kg: number) => Math.round(kg * 10) / 10;

export type PointsShown = {
  points: readonly TrendPoint[];
  first: TrendPoint;
  last: TrendPoint;
};

const chartSummary = ({ points, first, last }: PointsShown) => {
  const weights = points.map(({ weight }) => weight);
  const logged = points.length === 1 ? '1 weight' : `${points.length} weights`;
  return (
    `From ${formatDay(first.date)} to ${formatDay(last.date)}: ${logged} ` +
    `between ${formatWeight(Math.min(...weights))} and ${formatWeight(Math.max(...weights))}; ` +
    `the trend went from ${formatWeight(first.trend)} to ${formatWeight(last.trend)}.`
  );
};

export function WeightChart({
  weights,
  today,
}: {
  weights: readonly DatedWeight[];
  today: string;
}) {
  const headingId = useId();
  const [range, setRange] = useState<TrendRange>(defaultRange);
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const points = pointsInRange(trend, range, today);
  const first = points.at(0);
  const last = points.at(-1);

  if (trend.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="font-semibold">
          Trend
        </h2>
        <ToggleGroup
          aria-label="Range"
          variant="outline"
          size="sm"
          spacing={0}
          value={[range.id]}
          onValueChange={([id]) => {
            const chosen = trendRanges.find((candidate) => candidate.id === id);
            if (chosen !== undefined) {
              setRange(chosen);
            }
          }}
        >
          {trendRanges.map(({ id, label }) => (
            <ToggleGroupItem key={id} value={id}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {first === undefined || last === undefined ? (
        <p className="text-muted-foreground text-sm">
          No weights in the last {range.label}.
        </p>
      ) : (
        <TrendSummary points={points} first={first} last={last} />
      )}
    </section>
  );
}

function TrendSummary(shown: PointsShown) {
  const rate = weeklyRate(shown.points);

  return (
    <>
      <dl className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-sm">Trend weight</dt>
          <dd className="font-semibold text-xl tabular-nums">
            {formatWeight(shown.last.trend)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-sm">Weekly rate</dt>
          {rate === null ? (
            <dd className="text-muted-foreground text-sm">
              Needs a week of weights
            </dd>
          ) : (
            <dd className="font-semibold text-xl tabular-nums">
              {formatWeeklyRate(rate)}
            </dd>
          )}
        </div>
      </dl>
      <WeightTrendFigure {...shown} />
    </>
  );
}

export function WeightTrendFigure({ points, first, last }: PointsShown) {
  const summaryId = useId();
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
    <figure className="m-0" aria-labelledby={summaryId}>
      <figcaption id={summaryId} className="sr-only">
        {chartSummary({ points, first, last })}
      </figcaption>
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
            tickFormatter={(day: number) =>
              formatTick(addDays(first.date, day))
            }
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
    </figure>
  );
}
