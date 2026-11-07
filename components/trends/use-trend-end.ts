'use client';

import { skipToken, useQuery } from '@tanstack/react-query';
import { useToday } from '@/components/use-today';
import { addDays } from '@/lib/domain/dates';
import { hasMainMeals } from '@/lib/domain/diary/entries';
import { useTRPC } from '@/lib/trpc/client';

/**
 * The last date a trend range covers: today once breakfast, lunch and dinner
 * are logged, yesterday until then, so a day still being logged does not drag
 * the averages down. Snacks do not count. Null while today's diary loads; if
 * it cannot be read, today.
 */
export const useTrendEnd = () => {
  const trpc = useTRPC();
  const today = useToday();
  const day = useQuery(
    trpc.diary.day.queryOptions(today === null ? skipToken : today),
  );
  if (today === null || day.isPending) {
    return null;
  }
  if (day.isError) {
    return today;
  }
  const entries = day.data.meals.flatMap(({ entries }) => entries);
  return hasMainMeals(entries) ? today : addDays(today, -1);
};
