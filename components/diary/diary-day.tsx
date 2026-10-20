'use client';

import { useQuery } from '@tanstack/react-query';
import { useQueryState } from 'nuqs';
import { useState } from 'react';
import { AppPage } from '@/components/app-shell/app-page';
import { FormError } from '@/components/auth/fields';
import { LogWeightCard } from '@/components/body/log-weight-card';
import { dateParser } from '@/components/diary/date-param';
import { DayNavigation } from '@/components/diary/day-navigation';
import { DayTotals } from '@/components/diary/day-totals';
import { EditEntryDialog } from '@/components/diary/edit-entry-dialog';
import { FoodSearchSheet } from '@/components/diary/food-search-sheet';
import { MealSection } from '@/components/diary/meal-section';
import { Skeleton } from '@/components/ui/skeleton';
import { useToday } from '@/components/use-today';
import type { DiaryEntry } from '@/lib/db/diary';
import type { Meal } from '@/lib/domain/diary/entries';
import { useTRPC } from '@/lib/trpc/client';

export const loadFailed = 'This day could not be loaded.';

function DaySkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function Day({ date }: { date: string }) {
  const trpc = useTRPC();
  const day = useQuery(trpc.diary.day.queryOptions(date));
  const goal = useQuery(trpc.goals.forDate.queryOptions(date));
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [adding, setAdding] = useState<Meal | null>(null);

  if (day.isPending || goal.isPending) {
    return <DaySkeleton />;
  }
  if (day.isError || goal.isError) {
    return <FormError>{loadFailed}</FormError>;
  }

  return (
    <>
      <DayTotals
        date={date}
        totals={day.data.totals}
        goal={goal.data?.nutrients ?? null}
      />
      {day.data.meals.map(({ meal, entries, totals }) => (
        <MealSection
          key={meal}
          meal={meal}
          entries={entries}
          totals={totals}
          onSelectEntry={setEditing}
          onAdd={() => setAdding(meal)}
        />
      ))}
      <EditEntryDialog entry={editing} onClose={() => setEditing(null)} />
      <FoodSearchSheet
        date={date}
        meal={adding}
        onClose={() => setAdding(null)}
      />
    </>
  );
}

export function DiaryDay() {
  const today = useToday();
  const [chosenDate, setChosenDate] = useQueryState('date', dateParser);
  const date = chosenDate ?? today;

  return (
    <AppPage
      title="Diary"
      end={
        date === null || today === null ? null : (
          <DayNavigation
            date={date}
            today={today}
            onDateChange={(next) => setChosenDate(next === today ? null : next)}
          />
        )
      }
    >
      {today !== null && date === today ? (
        <LogWeightCard today={today} />
      ) : null}
      {date === null ? <DaySkeleton /> : <Day key={date} date={date} />}
    </AppPage>
  );
}
