import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { findLatestMeasurement } from '../../db/body-measurements.ts';
import { bodyMetrics } from '../../domain/body/measurements.ts';
import { isDate } from '../../domain/dates.ts';
import {
  listMeasurements,
  logMeasurement,
  measurementSchema,
  removeMeasurement,
} from '../../services/body.ts';
import { accountProcedure, router } from '../trpc.ts';

const dateInput = z.string().refine(isDate, { message: 'Not a date' });
const metricInput = z.enum(bodyMetrics);

const rangeInput = z
  .object({
    metric: metricInput,
    from: dateInput.optional(),
    to: dateInput.optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: 'The range ends before it starts',
    path: ['to'],
  });

export const bodyRouter = router({
  log: accountProcedure
    .input(measurementSchema)
    .mutation(({ ctx, input }) => logMeasurement(ctx, input)),
  remove: accountProcedure
    .input(z.string().min(1))
    .mutation(async ({ ctx, input }) => {
      if (!(await removeMeasurement(ctx, input))) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }),
  list: accountProcedure
    .input(rangeInput)
    .query(({ ctx, input }) => listMeasurements(ctx, input)),
  latest: accountProcedure
    .input(z.object({ metric: metricInput, onOrBefore: dateInput.optional() }))
    .query(({ ctx, input }) =>
      findLatestMeasurement(
        ctx.db,
        ctx.caller.userId,
        input.metric,
        input.onOrBefore,
      ),
    ),
});
