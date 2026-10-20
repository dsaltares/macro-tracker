import { addDays, daysBetween } from '../dates.ts';

export const trendSmoothingPerDay = 0.1;

export const minimumRateSpanDays = 7;

const daysPerWeek = 7;

export type DatedWeight = { date: string; value: number };

export type TrendPoint = { date: string; weight: number; trend: number };

export const weightTrend = (weights: readonly DatedWeight[]): TrendPoint[] => {
  const oldestFirst = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  let trend: number | undefined;
  return oldestFirst.map(({ date, value }) => {
    trend =
      trend === undefined
        ? value
        : trend + trendSmoothingPerDay * (value - trend);
    return { date, weight: value, trend };
  });
};

export const weeklyRate = (points: readonly TrendPoint[]) => {
  const first = points.at(0);
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  const days = daysBetween(first.date, last.date);
  if (days < minimumRateSpanDays) {
    return null;
  }
  return ((last.trend - first.trend) / days) * daysPerWeek;
};

export const trendRanges = [
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '1y', label: '1 year', days: 365 },
  { id: 'all', label: 'All', days: null },
] as const;

export type TrendRange = (typeof trendRanges)[number];

export const pointsInRange = (
  points: readonly TrendPoint[],
  range: { days: number | null },
  today: string,
) => {
  if (range.days === null) {
    return [...points];
  }
  const from = addDays(today, 1 - range.days);
  return points.filter(({ date }) => date >= from);
};

const rateFormat = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

export const formatWeeklyRate = (kgPerWeek: number) =>
  `${rateFormat.format(kgPerWeek)} kg a week`;
