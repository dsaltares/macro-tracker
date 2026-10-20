import { z } from 'zod';
import {
  listMeasurements as listMeasurementsFor,
  logMeasurement as logMeasurementFor,
  type MeasurementRange,
  type MeasurementToLog,
  removeMeasurement as removeMeasurementFor,
} from '../db/body-measurements.ts';
import type { Slice } from '../db/slice.ts';
import { weightKgSchema } from '../domain/body/measurements.ts';
import { isDate } from '../domain/dates.ts';
import type { ServiceContext } from './context.ts';

const dateInput = z.string().refine(isDate, { message: 'Not a date' });

export const measurementSchema = z.discriminatedUnion('metric', [
  z.object({
    date: dateInput,
    metric: z.literal('weight_kg'),
    value: weightKgSchema,
  }),
]);

export const logMeasurement = (
  context: ServiceContext,
  measurement: MeasurementToLog,
) => logMeasurementFor(context.db, context.caller.userId, measurement, context);

export const listMeasurements = (
  { db, caller }: ServiceContext,
  range: MeasurementRange,
  slice?: Slice,
) => listMeasurementsFor(db, caller.userId, range, slice);

export const removeMeasurement = (
  { db, caller }: ServiceContext,
  measurementId: string,
) => removeMeasurementFor(db, caller.userId, measurementId);
