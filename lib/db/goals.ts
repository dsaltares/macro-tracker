import type { Kysely } from 'kysely';
import { addDays } from '../domain/dates.ts';
import {
  type DatedGoal,
  type Goal,
  goalOn,
  goalsOn,
} from '../domain/goals/goal.ts';
import {
  defaultGoalSettings,
  type GoalSettings,
} from '../domain/goals/settings.ts';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import {
  findLatestMeasurement,
  listMeasurements,
} from './body-measurements.ts';
import { findProfile } from './profiles.ts';
import type { Database } from './schema.ts';

export const goalSettingsQuery = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('goals')
    .select([
      'mode',
      'weekly_rate_kg as weeklyRateKg',
      'protein_g_per_kg as proteinGPerKg',
      'fat_energy_share as fatEnergyShare',
      'overrides',
    ])
    .where('user_id', '=', userId);

export const findGoalSettings = async (
  db: Kysely<Database>,
  userId: string,
): Promise<GoalSettings> => {
  const row = await goalSettingsQuery(db, userId).executeTakeFirst();
  return row
    ? { ...row, overrides: JSON.parse(row.overrides) as NutrientVector }
    : defaultGoalSettings;
};

export const saveGoalSettings = async (
  db: Kysely<Database>,
  userId: string,
  settings: GoalSettings,
  now: string,
): Promise<GoalSettings> => {
  const { mode, weeklyRateKg, proteinGPerKg, fatEnergyShare, overrides } =
    settings;
  const fields = {
    mode,
    weekly_rate_kg: weeklyRateKg,
    protein_g_per_kg: proteinGPerKg,
    fat_energy_share: fatEnergyShare,
    overrides: JSON.stringify(overrides),
    updated_at: now,
  };
  await db
    .insertInto('goals')
    .values({ user_id: userId, ...fields, created_at: now })
    .onConflict((conflict) => conflict.column('user_id').doUpdateSet(fields))
    .execute();
  return { mode, weeklyRateKg, proteinGPerKg, fatEnergyShare, overrides };
};

export const findGoalOn = async (
  db: Kysely<Database>,
  userId: string,
  date: string,
): Promise<Goal | null> => {
  const [profile, weight, settings] = await Promise.all([
    findProfile(db, userId),
    findLatestMeasurement(db, userId, 'weight_kg', date),
    findGoalSettings(db, userId),
  ]);
  return profile && goalOn(profile, weight?.value ?? null, date, settings);
};

export const findGoalsOver = async (
  db: Kysely<Database>,
  userId: string,
  dates: readonly string[],
): Promise<DatedGoal[]> => {
  const from = dates.at(0);
  const to = dates.at(-1);
  if (from === undefined || to === undefined) {
    return [];
  }
  const [profile, before, weights, settings] = await Promise.all([
    findProfile(db, userId),
    findLatestMeasurement(db, userId, 'weight_kg', addDays(from, -1)),
    listMeasurements(db, userId, { metric: 'weight_kg', from, to }),
    findGoalSettings(db, userId),
  ]);
  return profile
    ? goalsOn(profile, before ? [before, ...weights] : weights, dates, settings)
    : dates.map((date) => ({ date, goal: null }));
};
