'use client';

import { useQuery } from '@tanstack/react-query';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useId } from 'react';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { FormError } from '@/components/auth/fields';
import { mealNames } from '@/components/diary/amounts';
import { dateParser } from '@/components/diary/date-param';
import {
  nutrientGroupNames,
  nutrientNames,
} from '@/components/nutrients/nutrient-names';
import {
  amountIn,
  formatShare,
  goalOf,
  ProgressBar,
} from '@/components/nutrients/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToday } from '@/components/use-today';
import { formatDay } from '@/lib/domain/dates';
import { type Meal, meals } from '@/lib/domain/diary/entries';
import {
  type NutrientProgress,
  nutrientProgress,
} from '@/lib/domain/goals/progress';
import {
  type NutrientGroup,
  nutrientByKey,
  nutrientGroups,
} from '@/lib/domain/nutrition/nutrients';
import { diaryHref } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';

export const loadFailed = 'These nutrients could not be loaded.';

export const noData = 'No data';

const wholeDay = 'day';

const selections = [
  { value: wholeDay, label: 'Day' },
  ...meals.map((meal) => ({ value: meal, label: mealNames[meal] })),
];

const mealParser = parseAsStringLiteral(meals);

const mealOf = (selection: string) =>
  meals.find((meal) => meal === selection) ?? null;

function PanelSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function NutrientRow({ row }: { row: NutrientProgress }) {
  const name = nutrientNames[row.key];
  const { key, amount, goal, kind, share, progress } = row;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-baseline gap-2 text-sm">
        <dt className="min-w-0 flex-1 truncate">{name}</dt>
        <dd className="flex shrink-0 items-baseline gap-2 tabular-nums">
          <span
            className={
              amount === undefined ? 'text-muted-foreground' : 'font-medium'
            }
          >
            {amount === undefined ? noData : amountIn(key, amount)}
          </span>
          {goal === undefined ? null : (
            <span className="text-muted-foreground">
              {' '}
              {goalOf(key, goal, kind)}
            </span>
          )}
          {share === undefined ? null : (
            <span className="w-10 text-right text-muted-foreground">
              {' '}
              {formatShare(share)}
            </span>
          )}
        </dd>
      </div>
      {progress === undefined ? null : (
        <ProgressBar
          label={name}
          share={share}
          kind={kind}
          progress={progress}
        />
      )}
    </div>
  );
}

function NutrientGroupSection({
  group,
  rows,
}: {
  group: NutrientGroup;
  rows: readonly NutrientProgress[];
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="font-semibold text-sm">
        {nutrientGroupNames[group]}
      </h2>
      <dl className="flex flex-col divide-y rounded-lg border">
        {rows.map((row) => (
          <NutrientRow key={row.key} row={row} />
        ))}
      </dl>
    </section>
  );
}

function Nutrients({ date, meal }: { date: string; meal: Meal | null }) {
  const trpc = useTRPC();
  const day = useQuery(trpc.diary.day.queryOptions(date));
  const goal = useQuery(trpc.goals.forDate.queryOptions(date));

  if (day.isPending || goal.isPending) {
    return <PanelSkeleton />;
  }
  if (day.isError || goal.isError) {
    return <FormError>{loadFailed}</FormError>;
  }

  const chosen = day.data.meals.filter(
    (totals) => meal === null || totals.meal === meal,
  );
  const totals = meal === null ? day.data.totals : (chosen[0]?.totals ?? {});

  if (chosen.every(({ entries }) => entries.length === 0)) {
    return (
      <p className="text-muted-foreground text-sm">
        {meal === null
          ? 'Nothing logged on this day yet.'
          : `Nothing logged for ${mealNames[meal].toLowerCase()} yet.`}
      </p>
    );
  }

  const rows = nutrientProgress(totals, goal.data?.nutrients ?? {});

  return (
    <div className="flex flex-col gap-6">
      {meal === null ? null : (
        <p className="text-muted-foreground text-sm">
          Percentages are of the day’s goals.
        </p>
      )}
      {nutrientGroups.map((group) => (
        <NutrientGroupSection
          key={group}
          group={group}
          rows={rows.filter(({ key }) => nutrientByKey[key].group === group)}
        />
      ))}
    </div>
  );
}

export function NutrientPanel() {
  const today = useToday();
  const [chosenDate] = useQueryState('date', dateParser);
  const [meal, setMeal] = useQueryState('meal', mealParser);
  const date = chosenDate ?? today;

  return (
    <AppPage
      title="Nutrients"
      start={<BackLink href={diaryHref(chosenDate)} label="Back to diary" />}
    >
      {date === null ? (
        <PanelSkeleton />
      ) : (
        <Tabs
          value={meal ?? wholeDay}
          onValueChange={(value) => setMeal(mealOf(value))}
          className="gap-4"
        >
          <p className="text-muted-foreground text-sm">{formatDay(date)}</p>
          <TabsList className="h-9! w-full">
            {selections.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="text-sm">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {selections.map(({ value }) => (
            <TabsContent key={value} value={value}>
              <Nutrients date={date} meal={mealOf(value)} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </AppPage>
  );
}
