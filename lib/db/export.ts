import type { Kysely } from 'kysely';
import { bodyMetrics } from '../domain/body/measurements.ts';
import {
  type Export,
  type ExportedFood,
  type ExportedMeasurement,
  exportVersion,
} from '../domain/export/schema.ts';
import {
  type MeasurementRange,
  measurementsQuery,
} from './body-measurements.ts';
import { diaryEntries } from './diary.ts';
import { portionsQuery } from './food-search.ts';
import { nutrientVector } from './foods.ts';
import { findGoalSettings } from './goals.ts';
import { findProfile } from './profiles.ts';
import type { Database } from './schema.ts';

export const ownedFoodsQuery = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('foods')
    .innerJoin('food_nutrients', 'food_nutrients.food_id', 'foods.id')
    .selectAll('food_nutrients')
    .select([
      'foods.id',
      'foods.name',
      'foods.brand',
      'foods.barcode',
      'foods.quantity_label',
      'foods.created_at',
      'foods.updated_at',
    ])
    .where('foods.owner_user_id', '=', userId)
    .orderBy('foods.created_at');

const ownedFoods = async (
  db: Kysely<Database>,
  userId: string,
): Promise<ExportedFood[]> => {
  const rows = await ownedFoodsQuery(db, userId).execute();
  const portions =
    rows.length === 0
      ? []
      : await portionsQuery(
          db,
          userId,
          rows.map(({ id }) => id),
        ).execute();
  return rows.map(
    ({
      id,
      name,
      brand,
      barcode,
      quantity_label,
      created_at,
      updated_at,
      ...nutrients
    }) => ({
      id,
      name,
      brand,
      barcode,
      quantityLabel: quantity_label,
      nutrients: nutrientVector(nutrients),
      portions: portions
        .filter(({ food_id }) => food_id === id)
        .map(({ label, grams }) => ({ label, grams })),
      createdAt: created_at,
      updatedAt: updated_at,
    }),
  );
};

export const measurementsOldestFirst = async (
  db: Kysely<Database>,
  userId: string,
  range: MeasurementRange,
): Promise<ExportedMeasurement[]> =>
  (
    await measurementsQuery(db, userId, range)
      .clearOrderBy()
      .orderBy('date')
      .execute()
  ).map(({ date, metric, value }) => ({ date, metric, value }));

const allMeasurements = async (db: Kysely<Database>, userId: string) =>
  (
    await Promise.all(
      bodyMetrics.map((metric) =>
        measurementsOldestFirst(db, userId, { metric }),
      ),
    )
  ).flat();

export const exportAccount = async (
  db: Kysely<Database>,
  userId: string,
  exportedAt: string,
): Promise<Export> => {
  const [profile, goals, foods, entries, measurements] = await Promise.all([
    findProfile(db, userId),
    findGoalSettings(db, userId),
    ownedFoods(db, userId),
    diaryEntries(db, userId, {}),
    allMeasurements(db, userId),
  ]);
  return {
    version: exportVersion,
    exportedAt,
    profile,
    goals,
    foods,
    entries,
    measurements,
  };
};
