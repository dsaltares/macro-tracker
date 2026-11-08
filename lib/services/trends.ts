import { z } from 'zod';
import { type TrendRange, trendRange as trendRangeFor } from '../db/trends.ts';
import { dateSchema, daysBetween, timeZoneSchema } from '../domain/dates.ts';
import { maxTrendRangeDays } from '../domain/trends/aggregations.ts';
import type { ServiceContext } from './context.ts';

export const trendRangeSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine(({ from, to }) => from <= to, {
    message: 'The range ends before it starts',
    path: ['to'],
  })
  .refine(({ from, to }) => daysBetween(from, to) < maxTrendRangeDays, {
    message: `A range spans at most ${maxTrendRangeDays} days`,
    path: ['to'],
  });

// A range of dates in the caller's time zone, which the instants of model calls fall on.
export const llmUsageRangeSchema = trendRangeSchema.and(
  z.object({ timeZone: timeZoneSchema }),
);

export const trendRange = ({ db, caller }: ServiceContext, range: TrendRange) =>
  trendRangeFor(db, caller.userId, range);
