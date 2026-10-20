import { addDays, daysBetween } from '../dates.ts';
import { dayTotals } from '../diary/entries.ts';
import type { NutrientKey } from '../nutrition/nutrients.ts';
import { type NutrientVector, scale, sum } from '../nutrition/vector.ts';

export const rollingAverageDays = 7;

export const adherenceTolerance = 0.1;

export const maxTrendRangeDays = 366;

export type DatedSnapshot = { date: string; nutrients: NutrientVector };

export type DailyTotal = {
  date: string;
  logged: boolean;
  totals: NutrientVector;
};

export type TrendDay = DailyTotal & { rollingAverage: NutrientVector | null };

export type GoalDay = DailyTotal & { goal: NutrientVector | null };

export const datesFrom = (from: string, to: string) =>
  Array.from({ length: daysBetween(from, to) + 1 }, (_, index) =>
    addDays(from, index),
  );

export const rollingWindowStart = (date: string) =>
  addDays(date, 1 - rollingAverageDays);

export const averageOf = (vectors: readonly NutrientVector[]) =>
  vectors.length === 0 ? null : scale(sum(vectors), 1 / vectors.length);

const loggedOnly = <Day extends DailyTotal>(days: readonly Day[]) =>
  days.filter(({ logged }) => logged);

export const loggedAverage = (days: readonly DailyTotal[]) =>
  averageOf(loggedOnly(days).map(({ totals }) => totals));

export const dailyTotals = (
  from: string,
  to: string,
  entries: readonly DatedSnapshot[],
): DailyTotal[] => {
  const entriesByDate = new Map<string, DatedSnapshot[]>();
  for (const entry of entries) {
    entriesByDate.set(entry.date, [
      ...(entriesByDate.get(entry.date) ?? []),
      entry,
    ]);
  }
  return datesFrom(from, to).map((date) => {
    const day = entriesByDate.get(date) ?? [];
    return { date, logged: day.length > 0, totals: dayTotals(day) };
  });
};

export const trendDays = (
  from: string,
  to: string,
  entries: readonly DatedSnapshot[],
): TrendDay[] => {
  const windowed = dailyTotals(rollingWindowStart(from), to, entries);
  return windowed.slice(rollingAverageDays - 1).map((day, index) => ({
    ...day,
    rollingAverage: loggedAverage(
      windowed.slice(index, index + rollingAverageDays),
    ),
  }));
};

export const isWithinEnergyGoal = (kcal: number, goalKcal: number) =>
  Math.abs(kcal - goalKcal) <= adherenceTolerance * goalKcal;

export const adherence = (days: readonly GoalDay[]) => {
  const judged = loggedOnly(days).flatMap(({ totals, goal }) =>
    goal?.energy_kcal === undefined
      ? []
      : [isWithinEnergyGoal(totals.energy_kcal ?? 0, goal.energy_kcal)],
  );
  return judged.length === 0
    ? null
    : judged.filter(Boolean).length / judged.length;
};

export const daysWithData = (days: readonly DailyTotal[]) => {
  const counts: Partial<Record<NutrientKey, number>> = {};
  for (const { totals } of loggedOnly(days)) {
    for (const key of Object.keys(totals) as NutrientKey[]) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
};

export const nutrientAverages = (days: readonly GoalDay[]) => {
  const logged = loggedOnly(days);
  return {
    days: days.length,
    loggedDays: logged.length,
    daysWithData: daysWithData(logged),
    average: loggedAverage(logged),
    goal: averageOf(logged.flatMap(({ goal }) => (goal ? [goal] : []))),
  };
};
