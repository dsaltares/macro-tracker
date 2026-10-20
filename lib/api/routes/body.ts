import { z } from 'zod';
import type { BodyMeasurement } from '../../db/body-measurements.ts';
import { bodyMetrics } from '../../domain/body/measurements.ts';
import { isDate } from '../../domain/dates.ts';
import {
  listMeasurements,
  logMeasurement,
  measurementSchema,
  removeMeasurement,
} from '../../services/body.ts';
import { apiError } from '../errors.ts';
import { apiHandler } from '../handler.ts';
import { cursorSchema, pageOfSlice, sliceAt } from '../pagination.ts';

export const measurementPageSize = 100;

const dateInput = z.string().refine(isDate, { message: 'Not a date' });

const measurementOf = ({ id, date, metric, value }: BodyMeasurement) => ({
  id,
  date,
  metric,
  value,
});

export const listMeasurementsRoute = apiHandler({
  scope: 'read',
  input: z
    .object({
      metric: z.enum(bodyMetrics).default('weight_kg'),
      from: dateInput.optional(),
      to: dateInput.optional(),
      cursor: cursorSchema,
    })
    .refine(({ from, to }) => !from || !to || from <= to, {
      message: 'The range ends before it starts',
      path: ['to'],
    }),
  handle: async ({ context, input: { cursor, ...range } }) => {
    const slice = sliceAt(cursor, measurementPageSize);
    return pageOfSlice(
      await listMeasurements(context, range, slice),
      slice,
      measurementOf,
    );
  },
});

export const logMeasurementRoute = apiHandler({
  scope: 'write',
  input: measurementSchema,
  status: 201,
  handle: async ({ context, input }) =>
    measurementOf(await logMeasurement(context, input)),
});

export const removeMeasurementRoute = apiHandler({
  scope: 'write',
  params: z.object({ id: z.string().min(1) }),
  handle: async ({ context, params }) => {
    if (!(await removeMeasurement(context, params.id))) {
      throw apiError('NOT_FOUND', 'There is no measurement with this id.');
    }
  },
});
