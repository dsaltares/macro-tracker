'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/components/auth/fields';
import {
  NutrientGroups,
  NutrientList,
} from '@/components/nutrients/nutrient-rows';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToday } from '@/components/use-today';
import { addDays, formatDay } from '@/lib/domain/dates';
import {
  byShare,
  type NutrientProgress,
  nutrientProgress,
} from '@/lib/domain/goals/progress';
import { useTRPC } from '@/lib/trpc/client';

export const loadFailed = 'This report could not be loaded.';

export const reportRanges = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '1y', label: '1 year', days: 365 },
] as const;

type ReportRange = (typeof reportRanges)[number];

const orders = [
  { id: 'group', label: 'Group' },
  { id: 'share', label: 'Percentage' },
] as const;

type Order = (typeof orders)[number]['id'];

const defaultRange = reportRanges[1];

const daysOf = (count: number) => (count === 1 ? '1 day' : `${count} days`);

export const daysWithDataNote = (withData: number, loggedDays: number) =>
  `Data on ${withData} of ${daysOf(loggedDays)}`;

function ReportSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function Choice<Option extends { id: string; label: string }>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly Option[];
  value: Option['id'];
  onChange: (chosen: Option) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      onValueChange={([id]) => {
        const chosen = choices.find((candidate) => candidate.id === id);
        if (chosen !== undefined) {
          onChange(chosen);
        }
      }}
    >
      {choices.map(({ id, label }) => (
        <ToggleGroupItem key={id} value={id}>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Report({
  today,
  range,
  order,
}: {
  today: string;
  range: ReportRange;
  order: Order;
}) {
  const trpc = useTRPC();
  const from = addDays(today, 1 - range.days);
  const report = useQuery(
    trpc.trends.nutrients.queryOptions({ from, to: today }),
  );

  if (report.isPending) {
    return <ReportSkeleton />;
  }
  if (report.isError) {
    return <FormError>{loadFailed}</FormError>;
  }

  const { loggedDays, daysWithData, average, goal } = report.data;

  if (average === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing logged in the last {range.label}.
      </p>
    );
  }

  const rows = nutrientProgress(average, goal ?? {});
  const noteOf = ({ key }: NutrientProgress) =>
    daysWithDataNote(daysWithData[key] ?? 0, loggedDays);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Daily averages over the {daysOf(loggedDays)} logged from{' '}
        {formatDay(from)} to {formatDay(today)}. Days with nothing logged are
        left out.
      </p>
      {order === 'share' ? (
        <NutrientList rows={byShare(rows)} noteOf={noteOf} />
      ) : (
        <NutrientGroups rows={rows} noteOf={noteOf} />
      )}
    </div>
  );
}

export function NutrientReport() {
  const today = useToday();
  const [range, setRange] = useState<ReportRange>(defaultRange);
  const [order, setOrder] = useState<Order>('group');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Choice
          label="Range"
          choices={reportRanges}
          value={range.id}
          onChange={setRange}
        />
        <Choice
          label="Sort by"
          choices={orders}
          value={order}
          onChange={({ id }) => setOrder(id)}
        />
      </div>
      {today === null ? (
        <ReportSkeleton />
      ) : (
        <Report today={today} range={range} order={order} />
      )}
    </div>
  );
}
