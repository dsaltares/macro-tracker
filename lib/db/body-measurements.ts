import type { Kysely } from 'kysely';
import type { BodyMetric } from '../domain/body.ts';
import type { FoodWriteContext } from './foods.ts';
import type { Database } from './schema.ts';

export type BodyMeasurement = {
  id: string;
  date: string;
  metric: BodyMetric;
  value: number;
};

export type MeasurementToLog = Omit<BodyMeasurement, 'id'>;

export type MeasurementRange = {
  metric: BodyMetric;
  from?: string | undefined;
  to?: string | undefined;
};

const measurementColumns = ['id', 'date', 'metric', 'value'] as const;

export const logMeasurement = (
  db: Kysely<Database>,
  userId: string,
  { date, metric, value }: MeasurementToLog,
  { now, nextId }: FoodWriteContext,
): Promise<BodyMeasurement> =>
  db
    .insertInto('body_measurements')
    .values({
      id: nextId(),
      user_id: userId,
      date,
      metric,
      value,
      created_at: now(),
    })
    .onConflict((conflict) =>
      conflict.columns(['user_id', 'metric', 'date']).doUpdateSet({ value }),
    )
    .returning(measurementColumns)
    .executeTakeFirstOrThrow();

export const measurementsQuery = (
  db: Kysely<Database>,
  userId: string,
  { metric, from, to }: MeasurementRange,
) => {
  let query = db
    .selectFrom('body_measurements')
    .select(measurementColumns)
    .where('user_id', '=', userId)
    .where('metric', '=', metric);
  if (from !== undefined) {
    query = query.where('date', '>=', from);
  }
  if (to !== undefined) {
    query = query.where('date', '<=', to);
  }
  return query.orderBy('date', 'desc');
};

export const listMeasurements = (
  db: Kysely<Database>,
  userId: string,
  range: MeasurementRange,
): Promise<BodyMeasurement[]> => measurementsQuery(db, userId, range).execute();

export const latestMeasurementQuery = (
  db: Kysely<Database>,
  userId: string,
  metric: BodyMetric,
  onOrBefore?: string,
) => measurementsQuery(db, userId, { metric, to: onOrBefore }).limit(1);

export const findLatestMeasurement = async (
  db: Kysely<Database>,
  userId: string,
  metric: BodyMetric,
  onOrBefore?: string,
): Promise<BodyMeasurement | null> =>
  (await latestMeasurementQuery(
    db,
    userId,
    metric,
    onOrBefore,
  ).executeTakeFirst()) ?? null;

export const measurementDeletion = (
  db: Kysely<Database>,
  userId: string,
  measurementId: string,
) =>
  db
    .deleteFrom('body_measurements')
    .where('id', '=', measurementId)
    .where('user_id', '=', userId);

export const removeMeasurement = async (
  db: Kysely<Database>,
  userId: string,
  measurementId: string,
) => {
  const { numDeletedRows } = await measurementDeletion(
    db,
    userId,
    measurementId,
  ).executeTakeFirst();
  return numDeletedRows > 0n;
};
