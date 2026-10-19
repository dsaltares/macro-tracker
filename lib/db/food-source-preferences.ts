import type { Kysely } from 'kysely';
import {
  type GenericSource,
  genericSources,
  type ReferenceSource,
  referenceSources,
} from '../domain/foods/sources.ts';
import type { Database } from './schema.ts';

export type SourcePreference = {
  source: GenericSource;
  enabled: boolean;
};

export type FoodSourceSummary = {
  source: ReferenceSource;
  enabled: boolean;
  alwaysOn: boolean;
  foods: number;
};

export const liveFoodCountsQuery = (db: Kysely<Database>) =>
  db
    .selectFrom('foods')
    .select(['source', (eb) => eb.fn.countAll<number>().as('foods')])
    .where('source', 'in', referenceSources)
    .where('archived_at', 'is', null)
    .groupBy('source');

export const sourcePreferencesQuery = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('food_source_preferences')
    .select(['source', 'enabled', 'position'])
    .where('user_id', '=', userId);

const defaultPreferences = genericSources.map((source, position) => ({
  source,
  enabled: 1,
  position,
}));

const preferencesOf = async (db: Kysely<Database>, userId: string | null) => {
  const saved =
    userId === null ? [] : await sourcePreferencesQuery(db, userId).execute();
  return defaultPreferences
    .map(
      (preference) =>
        saved.find(({ source }) => source === preference.source) ?? preference,
    )
    .toSorted((a, b) => a.position - b.position);
};

export const listFoodSources = async (
  db: Kysely<Database>,
  userId: string | null,
): Promise<FoodSourceSummary[]> => {
  const [counts, preferences] = await Promise.all([
    liveFoodCountsQuery(db).execute(),
    preferencesOf(db, userId),
  ]);
  const foodsOf = (source: ReferenceSource) =>
    Number(counts.find((count) => count.source === source)?.foods ?? 0);
  return [
    { source: 'off', enabled: true, alwaysOn: true, foods: foodsOf('off') },
    ...preferences.map(({ source, enabled }) => ({
      source,
      enabled: enabled === 1,
      alwaysOn: false,
      foods: foodsOf(source),
    })),
  ];
};

export const setFoodSourcePreferences = (
  db: Kysely<Database>,
  userId: string,
  preferences: readonly SourcePreference[],
) =>
  db
    .insertInto('food_source_preferences')
    .values(
      preferences.map(({ source, enabled }, position) => ({
        user_id: userId,
        source,
        enabled: enabled ? 1 : 0,
        position,
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(['user_id', 'source']).doUpdateSet((eb) => ({
        enabled: eb.ref('excluded.enabled'),
        position: eb.ref('excluded.position'),
      })),
    )
    .execute();
