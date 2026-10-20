import { z } from 'zod';
import { type TrendRange, trendRange as trendRangeFor } from '../db/trends.ts';
import { daysBetween, isDate } from '../domain/dates.ts';
import { maxTrendRangeDays } from '../domain/trends/aggregations.ts';
import type { ServiceContext } from './context.ts';

const dateInput = z.string().refine(isDate, { message: 'Not a date' });

export const trendRangeSchema = z
  .object({ from: dateInput, to: dateInput })
  .refine(({ from, to }) => from <= to, {
    message: 'The range ends before it starts',
    path: ['to'],
  })
  .refine(({ from, to }) => daysBetween(from, to) < maxTrendRangeDays, {
    message: `A range spans at most ${maxTrendRangeDays} days`,
    path: ['to'],
  });

export const trendRange = ({ db, caller }: ServiceContext, range: TrendRange) =>
  trendRangeFor(db, caller.userId, range);
