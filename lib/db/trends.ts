import type { Kysely } from 'kysely';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import {
  adherence,
  type DailyTotal,
  dailyTotals,
  datesFrom,
  nutrientAverages,
  rollingWindowStart,
  trendDays,
} from '../domain/trends/aggregations.ts';
import { llmUsage, llmUsageWindow } from '../domain/trends/llm-usage.ts';
import { diaryEntries } from './diary.ts';
import { findGoalsOver } from './goals.ts';
import { llmCallsOverQuery } from './llm-calls.ts';
import type { Database } from './schema.ts';

export type TrendRange = { from: string; to: string };

const goalVectorsOver = async (
  db: Kysely<Database>,
  userId: string,
  { from, to }: TrendRange,
) =>
  new Map(
    (await findGoalsOver(db, userId, datesFrom(from, to))).map(
      ({ date, goal }) => [date, goal?.nutrients ?? null],
    ),
  );

const withGoals =
  (goals: Map<string, NutrientVector | null>) =>
  <Day extends DailyTotal>(day: Day) => ({
    ...day,
    goal: goals.get(day.date) ?? null,
  });

export const trendRange = async (
  db: Kysely<Database>,
  userId: string,
  range: TrendRange,
) => {
  const { from, to } = range;
  const [entries, goals] = await Promise.all([
    diaryEntries(db, userId, { from: rollingWindowStart(from), to }),
    goalVectorsOver(db, userId, range),
  ]);
  const days = trendDays(from, to, entries).map(withGoals(goals));
  return { from, to, days, adherence: adherence(days) };
};

export const trendNutrients = async (
  db: Kysely<Database>,
  userId: string,
  range: TrendRange,
) => {
  const { from, to } = range;
  const [entries, goals] = await Promise.all([
    diaryEntries(db, userId, range),
    goalVectorsOver(db, userId, range),
  ]);
  const days = dailyTotals(from, to, entries).map(withGoals(goals));
  return { from, to, ...nutrientAverages(days) };
};

// The model calls a user's requests made on each date of a range, in their time zone.
export const trendLlmUsage = async (
  db: Kysely<Database>,
  userId: string,
  { from, to, timeZone }: TrendRange & { timeZone: string },
) => {
  const calls = await llmCallsOverQuery(
    db,
    userId,
    llmUsageWindow(from, to),
  ).execute();
  return { from, to, ...llmUsage(from, to, timeZone, calls) };
};
