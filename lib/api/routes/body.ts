import { z } from 'zod';
import type { BodyMeasurement } from '../../db/body-measurements.ts';
import { bodyMetrics } from '../../domain/body/measurements.ts';
import { dateSchema } from '../../domain/dates.ts';
import {
  listMeasurements,
  logMeasurement,
  measurementSchema,
  removeMeasurement,
} from '../../services/body.ts';
import { apiFailure } from '../errors.ts';
import { apiHandler } from '../handler.ts';
import { cursorSchema, pageOfSlice, sliceAt } from '../pagination.ts';
import { idSchema, measurement, page } from '../schemas.ts';

export const measurementPageSize = 100;

const measurementOf = ({ id, date, metric, value }: BodyMeasurement) => ({
  id,
  date,
  metric,
  value,
});

const measurementNotFound = apiFailure(
  'NOT_FOUND',
  'There is no measurement with this id.',
);

const exampleMeasurement = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  date: '2026-10-20',
  metric: 'weight_kg' as const,
  value: 71.4,
};

export const listMeasurementsRoute = apiHandler({
  method: 'GET',
  path: '/measurements',
  operationId: 'listMeasurements',
  summary: 'List measurements',
  description:
    'The caller’s body measurements of one metric, newest first, within an optional inclusive range of dates. Pages of 100.',
  scope: 'read',
  input: z
    .object({
      metric: z.enum(bodyMetrics).default('weight_kg'),
      from: dateSchema.optional().describe('The first day to include.'),
      to: dateSchema.optional().describe('The last day to include.'),
      cursor: cursorSchema.describe(
        'The nextCursor of the previous page; leave out for the first page.',
      ),
    })
    .refine(({ from, to }) => !from || !to || from <= to, {
      message: 'The range ends before it starts',
      path: ['to'],
    }),
  output: page(measurement),
  example: {
    input: { metric: 'weight_kg', from: '2026-10-01', to: '2026-10-20' },
    response: {
      items: [
        exampleMeasurement,
        {
          id: '8b7c6d5e-4f3a-4b2c-9d1e-0f9a8b7c6d5e',
          date: '2026-10-13',
          metric: 'weight_kg',
          value: 71.9,
        },
      ],
      nextCursor: null,
    },
  },
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
  method: 'POST',
  path: '/measurements',
  operationId: 'logMeasurement',
  summary: 'Log a measurement',
  description:
    'Record a body measurement for a day. A day has one value per metric, so logging the same day again replaces it and keeps its id. Weight is in kg, 20 to 400.',
  scope: 'write',
  input: measurementSchema,
  output: measurement,
  status: 201,
  example: {
    input: { date: '2026-10-20', metric: 'weight_kg', value: 71.4 },
    response: exampleMeasurement,
  },
  handle: async ({ context, input }) =>
    measurementOf(await logMeasurement(context, input)),
});

export const removeMeasurementRoute = apiHandler({
  method: 'DELETE',
  path: '/measurements/{id}',
  operationId: 'removeMeasurement',
  summary: 'Remove a measurement',
  description: 'Delete one of the caller’s measurements. Answers 204.',
  scope: 'write',
  params: z.object({ id: idSchema }),
  errors: [measurementNotFound],
  example: { params: { id: exampleMeasurement.id } },
  handle: async ({ context, params }) => {
    if (!(await removeMeasurement(context, params.id))) {
      throw measurementNotFound();
    }
  },
});
