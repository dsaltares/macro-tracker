'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useId, useMemo, useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { ChartSkeleton } from '@/components/chart-skeleton';
import type { LlmUsageRow } from '@/components/trends/trend-charts';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDay } from '@/lib/domain/dates';
import {
  formatCount,
  formatUsd,
  type LlmUsage,
  type LlmUsageTotals,
} from '@/lib/domain/trends/llm-usage';
import { useTRPC } from '@/lib/trpc/client';

export const llmUsageLoadFailed = 'Your AI usage could not be loaded.';

const LlmUsageChartPlot = dynamic(
  () =>
    import('@/components/trends/trend-charts').then(
      ({ LlmUsageChartPlot }) => LlmUsageChartPlot,
    ),
  { ssr: false, loading: ChartSkeleton },
);

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const none = '–';

const cost = ({ costUsd }: LlmUsageTotals) =>
  costUsd === null ? none : formatUsd(costUsd);

export const llmUsageMetrics = [
  {
    id: 'cost',
    label: 'Cost',
    of: ({ costUsd }: LlmUsageTotals) => costUsd ?? 0,
    format: formatUsd,
  },
  {
    id: 'calls',
    label: 'Calls',
    of: ({ calls }: LlmUsageTotals) => calls,
    format: formatCount,
  },
  {
    id: 'input',
    label: 'Input tokens',
    of: ({ inputTokens }: LlmUsageTotals) => inputTokens,
    format: formatCount,
  },
  {
    id: 'output',
    label: 'Output tokens',
    of: ({ outputTokens }: LlmUsageTotals) => outputTokens,
    format: formatCount,
  },
] as const;

type LlmUsageMetric = (typeof llmUsageMetrics)[number];

const usageSummary = (
  { from, to }: { from: string; to: string },
  { totals, models }: LlmUsage,
) =>
  `From ${formatDay(from)} to ${formatDay(to)}: ` +
  `${formatCount(totals.calls)} model calls to ${models.map(({ model }) => model).join(', ')}, ` +
  `reading ${formatCount(totals.inputTokens)} input tokens and writing ` +
  `${formatCount(totals.outputTokens)} output tokens, at a cost of ${cost(totals)}.`;

function SummaryItem({ term, children }: { term: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-sm">{term}</dt>
      <dd className="font-semibold text-lg tabular-nums">{children}</dd>
    </div>
  );
}

function UsageChart({
  usage,
  metric,
}: {
  usage: LlmUsage;
  metric: LlmUsageMetric;
}) {
  const series = useMemo(
    () =>
      usage.models.map(({ model }, index) => ({
        key: `m${index}`,
        label: model,
      })),
    [usage.models],
  );
  const rows = useMemo(
    () =>
      usage.days.map(({ date, byModel }): LlmUsageRow => {
        const row: LlmUsageRow = { date };
        usage.models.forEach(({ model }, index) => {
          const totals = byModel[model];
          row[`m${index}`] = totals === undefined ? 0 : metric.of(totals);
        });
        return row;
      }),
    [usage, metric],
  );

  return (
    <LlmUsageChartPlot
      rows={rows}
      series={series}
      formatValue={metric.format}
    />
  );
}

function ModelTable({ usage }: { usage: LlmUsage }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">Usage by model</caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-3 text-left font-normal">
              Model
            </th>
            <th scope="col" className="px-3 py-1 text-right font-normal">
              Calls
            </th>
            <th scope="col" className="px-3 py-1 text-right font-normal">
              Input
            </th>
            <th scope="col" className="px-3 py-1 text-right font-normal">
              Output
            </th>
            <th scope="col" className="py-1 pl-3 text-right font-normal">
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          {usage.models.map((model) => (
            <tr key={model.model} className="border-t">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {model.model}
              </th>
              <td className="px-3 py-1.5 text-right">
                {formatCount(model.calls)}
              </td>
              <td className="px-3 py-1.5 text-right">
                {formatCount(model.inputTokens)}
              </td>
              <td className="px-3 py-1.5 text-right">
                {formatCount(model.outputTokens)}
              </td>
              <td className="py-1.5 pl-3 text-right">{cost(model)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LlmUsageSection({
  from,
  to,
  rangeLabel,
}: {
  from: string;
  to: string;
  rangeLabel: string;
}) {
  const trpc = useTRPC();
  const headingId = useId();
  const summaryId = useId();
  const [timeZone] = useState(browserTimeZone);
  const [metric, setMetric] = useState<LlmUsageMetric>(llmUsageMetrics[0]);
  const usage = useQuery({
    ...trpc.trends.llmUsage.queryOptions({ from, to, timeZone }),
    placeholderData: keepPreviousData,
  });

  const content = () => {
    if (usage.isError) {
      return <FormError>{llmUsageLoadFailed}</FormError>;
    }
    if (usage.isPending) {
      return <p className="text-muted-foreground text-sm">Loading…</p>;
    }
    const { totals } = usage.data;
    if (totals.calls === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          No AI requests in the last {rangeLabel}.
        </p>
      );
    }
    return (
      <>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryItem term="Calls">{formatCount(totals.calls)}</SummaryItem>
          <SummaryItem term="Input tokens">
            {formatCount(totals.inputTokens)}
          </SummaryItem>
          <SummaryItem term="Output tokens">
            {formatCount(totals.outputTokens)}
          </SummaryItem>
          <SummaryItem term="Cost">{cost(totals)}</SummaryItem>
        </dl>
        {totals.unpricedCalls > 0 && (
          <p className="text-muted-foreground text-sm">
            The cost leaves out {formatCount(totals.unpricedCalls)}{' '}
            {totals.unpricedCalls === 1 ? 'call' : 'calls'} to a model with no
            price.
          </p>
        )}
        <ToggleGroup
          aria-label="Chart"
          variant="outline"
          size="sm"
          spacing={0}
          value={[metric.id]}
          onValueChange={([id]) => {
            const chosen = llmUsageMetrics.find(
              (candidate) => candidate.id === id,
            );
            if (chosen !== undefined) {
              setMetric(chosen);
            }
          }}
        >
          {llmUsageMetrics.map(({ id, label }) => (
            <ToggleGroupItem key={id} value={id}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <figure className="m-0" aria-labelledby={summaryId}>
          <figcaption id={summaryId} className="sr-only">
            {usageSummary({ from, to }, usage.data)}
          </figcaption>
          <UsageChart usage={usage.data} metric={metric} />
        </figure>
        <ModelTable usage={usage.data} />
      </>
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id={headingId} className="font-semibold">
        AI usage
      </h2>
      {content()}
    </section>
  );
}
