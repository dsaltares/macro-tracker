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
import { diaryEntries } from './diary.ts';
import { findGoalsOver } from './goals.ts';
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
