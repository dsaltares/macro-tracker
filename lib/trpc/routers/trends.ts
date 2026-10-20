import { z } from 'zod';
import { trendNutrients, trendRange } from '../../db/trends.ts';
import { daysBetween, isDate } from '../../domain/dates.ts';
import { maxTrendRangeDays } from '../../domain/trends/aggregations.ts';
import { accountProcedure, router } from '../trpc.ts';

const dateInput = z.string().refine(isDate, { message: 'Not a date' });

const rangeInput = z
  .object({ from: dateInput, to: dateInput })
  .refine(({ from, to }) => from <= to, {
    message: 'The range ends before it starts',
    path: ['to'],
  })
  .refine(({ from, to }) => daysBetween(from, to) < maxTrendRangeDays, {
    message: `A range spans at most ${maxTrendRangeDays} days`,
    path: ['to'],
  });

export const trendsRouter = router({
  range: accountProcedure
    .input(rangeInput)
    .query(({ ctx, input }) => trendRange(ctx.db, ctx.caller.userId, input)),
  nutrients: accountProcedure
    .input(rangeInput)
    .query(({ ctx, input }) =>
      trendNutrients(ctx.db, ctx.caller.userId, input),
    ),
});
