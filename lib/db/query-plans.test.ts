import SQLite from 'better-sqlite3';
import { type CompiledQuery, Kysely, SqliteDialect } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountDeletion } from './accounts.ts';
import {
  latestMeasurementQuery,
  measurementDeletion,
  measurementsQuery,
} from './body-measurements.ts';
import {
  diaryDayQuery,
  diaryEntriesQuery,
  diaryEntryDeletion,
  diaryEntryQuery,
  diaryMealDeletion,
  favouriteDeletion,
  favouritesQuery,
  frequentFoodsQuery,
  lastLoggedAmountsQuery,
  recentFoodsQuery,
} from './diary.ts';
import { ownedFoodsQuery } from './export.ts';
import { lastSucceededFoodImportQuery } from './food-imports.ts';
import { userPortionDeletion } from './food-portions.ts';
import {
  foodByBarcodeQuery,
  foodByIdQuery,
  foodSummariesQuery,
  portionsQuery,
  searchQuery,
  userFoodsQuery,
} from './food-search.ts';
import {
  liveFoodCountsQuery,
  sourcePreferencesQuery,
} from './food-source-preferences.ts';
import { userPortionsDeletion } from './foods.ts';
import { goalSettingsQuery } from './goals.ts';
import { migrateToLatest } from './migrator.ts';
import { profileQuery } from './profiles.ts';
import {
  recipeIngredientsQuery,
  recipeQuery,
  userRecipesQuery,
} from './recipes.ts';
import type { Database } from './schema.ts';
import {
  passwordCreation,
  signInMethodDisconnection,
  signInMethodsQuery,
} from './sign-in-methods.ts';
import {
  ownBarcodeQuery,
  ownFoodQuery,
  userFoodArchival,
} from './user-foods.ts';

const sqlite = new SQLite(':memory:');
const db = new Kysely<Database>({
  dialect: new SqliteDialect({ database: sqlite }),
});

beforeAll(async () => {
  await migrateToLatest(db);
});

afterAll(async () => {
  await db.destroy();
});

const planOf = ({ sql, parameters }: CompiledQuery) =>
  sqlite
    .prepare<unknown[], { detail: string }>(`explain query plan ${sql}`)
    .all(...parameters)
    .map(({ detail }) => detail);

const scansOf = (plan: string[], tables: (keyof Database)[]) =>
  plan.filter((step) =>
    tables.some((table) => new RegExp(`^SCAN ${table}\\b`).test(step)),
  );

const expectNoScan = (query: CompiledQuery, tables: (keyof Database)[]) =>
  expect(scansOf(planOf(query), tables)).toEqual([]);

const expectSearch = (query: CompiledQuery, table: keyof Database) =>
  expect(planOf(query)).toEqual([
    expect.stringMatching(new RegExp(`^SEARCH ${table} USING`)),
  ]);

describe('query plans', () => {
  it('flags a scan on a table it names', () => {
    const query = db.selectFrom('meta').selectAll().compile();

    expect(scansOf(planOf(query), ['meta'])).toEqual(['SCAN meta']);
  });

  it('reads meta by key without a scan', () => {
    expectNoScan(
      db.selectFrom('meta').select('value').where('key', '=', 'k').compile(),
      ['meta'],
    );
  });

  it('flags a step that is not a search on the table it names', () => {
    const query = db.selectFrom('foods').selectAll().compile();

    expect(() => expectSearch(query, 'foods')).toThrow();
  });

  it('finds a food by id with a search', () => {
    expectSearch(
      db.selectFrom('foods').selectAll().where('id', '=', 'f').compile(),
      'foods',
    );
  });

  it('finds foods by barcode with a search', () => {
    expectSearch(
      db
        .selectFrom('foods')
        .selectAll()
        .where('barcode', '=', '3017620422003')
        .compile(),
      'foods',
    );
  });

  it('finds a reference food by source and source id with a search', () => {
    expectSearch(
      db
        .selectFrom('foods')
        .selectAll()
        .where('source', '=', 'off')
        .where('source_id', '=', '3017620422003')
        .compile(),
      'foods',
    );
  });

  it("finds a user's own foods with a search", () => {
    expectSearch(
      db
        .selectFrom('foods')
        .selectAll()
        .where('owner_user_id', '=', 'u')
        .compile(),
      'foods',
    );
  });

  it("reads a food's nutrients with a search", () => {
    expectSearch(
      db
        .selectFrom('food_nutrients')
        .selectAll()
        .where('food_id', '=', 'f')
        .compile(),
      'food_nutrients',
    );
  });

  it("reads a food's portions in order with a search", () => {
    expectSearch(
      db
        .selectFrom('food_portions')
        .selectAll()
        .where('food_id', '=', 'f')
        .orderBy('position')
        .compile(),
      'food_portions',
    );
  });

  it("clears a food's stale upstream portions with a search", () => {
    expectSearch(
      db
        .deleteFrom('food_portions')
        .where('food_id', '=', 'f')
        .where('source', '=', 'upstream')
        .where('label', 'not in', ['1 serving'])
        .compile(),
      'food_portions',
    );
  });

  it('archives the unseen foods of a source without a scan', () => {
    expectNoScan(
      db
        .updateTable('foods')
        .set({ archived_at: 't', updated_at: 't' })
        .where('source', 'in', ['off', 'usda'])
        .where('archived_at', 'is', null)
        .where('updated_at', '<', 't')
        .compile(),
      ['foods'],
    );
  });

  it('finds whether any reference food exists without a scan', () => {
    expectNoScan(
      db
        .selectFrom('foods')
        .select('id')
        .where('source', 'in', ['off', 'ciqual', 'cofid', 'usda'])
        .limit(1)
        .compile(),
      ['foods'],
    );
  });

  it('finds the running food import with a search', () => {
    expectSearch(
      db
        .selectFrom('food_imports')
        .selectAll()
        .where('status', '=', 'running')
        .compile(),
      'food_imports',
    );
  });

  it('finds the last succeeded import of a source without a scan', () => {
    expectNoScan(lastSucceededFoodImportQuery(db, 'off-deltas').compile(), [
      'food_imports',
    ]);
  });

  it('fails the running food import without a scan', () => {
    expectNoScan(
      db
        .updateTable('food_imports')
        .set({ status: 'failed', error: 'interrupted', finished_at: 't' })
        .where('status', '=', 'running')
        .compile(),
      ['food_imports'],
    );
  });

  it('searches foods through the full-text index without a scan', () => {
    const plan = planOf(searchQuery(db, null, '"nut"*', 0).compile());

    expect(plan).toContainEqual(
      expect.stringMatching(/^SCAN foods_fts VIRTUAL TABLE INDEX/),
    );
    expect(scansOf(plan, ['foods', 'food_nutrients'])).toEqual([]);
  });

  it("searches a user's foods and enabled sources without a scan", () => {
    expectNoScan(searchQuery(db, 'u', '"nut"*', 30).compile(), [
      'foods',
      'food_nutrients',
      'food_source_preferences',
    ]);
  });

  it('reads the portions a user sees of a page of foods with a search', () => {
    expectNoScan(portionsQuery(db, 'u', ['f', 'g']).compile(), [
      'food_portions',
    ]);
  });

  it("removes a user's portion by id with a search", () => {
    expectSearch(userPortionDeletion(db, 'u', 'p').compile(), 'food_portions');
  });

  it('finds a food a user sees by id with a search', () => {
    expectSearch(foodByIdQuery(db, 'u', 'f').compile(), 'foods');
  });

  it('finds the food a user sees by barcode without a scan', () => {
    expectNoScan(foodByBarcodeQuery(db, 'u', '3017620422003').compile(), [
      'foods',
    ]);
    expectNoScan(foodByBarcodeQuery(db, null, '3017620422003').compile(), [
      'foods',
    ]);
  });

  it("lists a user's live foods without a scan", () => {
    expectNoScan(userFoodsQuery(db, 'u', null, 0).compile(), [
      'foods',
      'food_nutrients',
    ]);
  });

  it("searches a user's live foods without a scan", () => {
    expectNoScan(userFoodsQuery(db, 'u', '"nut"*', 30).compile(), [
      'foods',
      'food_nutrients',
    ]);
  });

  it("finds a user's live food by id with a search", () => {
    expectSearch(ownFoodQuery(db, 'u', 'f').compile(), 'foods');
  });

  it("finds a user's live foods by barcode with a search", () => {
    expectSearch(ownBarcodeQuery(db, 'u', '3017620422003').compile(), 'foods');
  });

  it("archives a user's food with a search", () => {
    expectSearch(userFoodArchival(db, 'u', 'f', 't').compile(), 'foods');
  });

  it("replaces a user's portions of their food with a search", () => {
    expectSearch(userPortionsDeletion(db, 'f', 'u').compile(), 'food_portions');
  });

  it('counts the live foods of every source from a covering index', () => {
    expect(planOf(liveFoodCountsQuery(db).compile())).toEqual([
      expect.stringMatching(
        /^SEARCH foods USING COVERING INDEX foods_live_source/,
      ),
    ]);
  });

  it("reads a user's source preferences with a search", () => {
    expectSearch(
      sourcePreferencesQuery(db, 'u').compile(),
      'food_source_preferences',
    );
  });

  it("reads a user's profile by its key", () => {
    expectSearch(profileQuery(db, 'u').compile(), 'profiles');
  });

  it("reads a user's goal settings by their key", () => {
    expectSearch(goalSettingsQuery(db, 'u').compile(), 'goals');
  });

  it('deletes an account and cascades to what it owns without a scan', () => {
    expectNoScan(accountDeletion(db, 'u', 'u@example.test').compile(), [
      'users',
      'sessions',
      'accounts',
      'profiles',
      'food_source_preferences',
      'diary_entries',
      'favourites',
      'body_measurements',
      'goals',
      'recipes',
      'recipe_ingredients',
    ]);
  });

  it("drops a deleted user's foods from recipes with a search", () => {
    expectSearch(
      db.deleteFrom('recipe_ingredients').where('food_id', '=', 'f').compile(),
      'recipe_ingredients',
    );
  });

  it('drops a deleted recipe from the recipes it is in with a search', () => {
    expectSearch(
      db
        .deleteFrom('recipe_ingredients')
        .where('child_recipe_id', '=', 'r')
        .compile(),
      'recipe_ingredients',
    );
  });

  it("lists a user's live recipes with a search, in order from the index", () => {
    expect(planOf(userRecipesQuery(db, 'u').compile())).toEqual([
      expect.stringMatching(/^SEARCH recipes USING INDEX recipes_user_id_name/),
    ]);
  });

  it("reads a user's recipe by id with a search", () => {
    expectSearch(recipeQuery(db, 'u', 'r').compile(), 'recipes');
  });

  it("reads a user's recipe's ingredients in order without a scan", () => {
    const plan = planOf(recipeIngredientsQuery(db, 'u', 'r').compile());

    expect(plan).toContainEqual(
      expect.stringMatching(
        /^SEARCH recipe_ingredients USING INDEX recipe_ingredients_recipe_id_position/,
      ),
    );
    expect(plan).not.toContainEqual(expect.stringMatching(/TEMP B-TREE/));
    expectNoScan(recipeIngredientsQuery(db, 'u', 'r').compile(), [
      'recipes',
      'recipe_ingredients',
    ]);
  });

  it("finds a deleted user's portions with a search", () => {
    expectSearch(
      db.deleteFrom('food_portions').where('user_id', '=', 'u').compile(),
      'food_portions',
    );
  });

  it("reads a user's day of diary entries with a search", () => {
    expectSearch(
      diaryDayQuery(db, 'u', '2026-10-20').compile(),
      'diary_entries',
    );
  });

  it("reads a user's diary entries over a range, or all of them, with a search", () => {
    for (const range of [{}, { from: '2026-10-01', to: '2026-10-31' }]) {
      expectSearch(
        diaryEntriesQuery(db, 'u', range).compile(),
        'diary_entries',
      );
    }
  });

  it("reads a user's own foods with their nutrients without a scan", () => {
    expectNoScan(ownedFoodsQuery(db, 'u').compile(), [
      'foods',
      'food_nutrients',
    ]);
  });

  it("reads a user's diary entry by id with a search", () => {
    expectSearch(diaryEntryQuery(db, 'u', 'e').compile(), 'diary_entries');
  });

  it("reads one meal of a user's day with a search", () => {
    expectSearch(
      diaryDayQuery(db, 'u', '2026-10-20')
        .where('meal', '=', 'lunch')
        .compile(),
      'diary_entries',
    );
  });

  it("removes a user's diary entry by id with a search", () => {
    expectSearch(diaryEntryDeletion(db, 'u', 'e').compile(), 'diary_entries');
  });

  it("clears one meal of a user's day with a search", () => {
    expectSearch(
      diaryMealDeletion(db, 'u', {
        date: '2026-10-20',
        meal: 'lunch',
      }).compile(),
      'diary_entries',
    );
  });

  it("clears a deleted food's link from the diary with a search", () => {
    expectSearch(
      db
        .updateTable('diary_entries')
        .set({ food_id: null })
        .where('food_id', '=', 'f')
        .compile(),
      'diary_entries',
    );
  });

  it('reads the foods a user logged last with a search on their entries', () => {
    expect(planOf(recentFoodsQuery(db, 'u').compile())).toContainEqual(
      expect.stringMatching(
        /^SEARCH diary_entries USING INDEX diary_entries_user_id_date \(user_id=\?\)/,
      ),
    );
    expectNoScan(recentFoodsQuery(db, 'u').compile(), ['diary_entries']);
  });

  it('counts the foods a user logged over a range of dates with a search on the range', () => {
    expect(
      planOf(frequentFoodsQuery(db, 'u', '2026-10-20').compile()),
    ).toContainEqual(
      expect.stringMatching(
        /^SEARCH diary_entries USING INDEX diary_entries_user_id_date \(user_id=\? AND date>\? AND date<\?\)/,
      ),
    );
    expectNoScan(frequentFoodsQuery(db, 'u', '2026-10-20').compile(), [
      'diary_entries',
    ]);
  });

  it('reads the amounts a user last logged of some foods with a search', () => {
    expectNoScan(lastLoggedAmountsQuery(db, 'u', ['f', 'g']).compile(), [
      'diary_entries',
    ]);
  });

  it('reads what search shows of some foods with a search', () => {
    expectNoScan(foodSummariesQuery(db, 'u', ['f', 'g']).compile(), [
      'foods',
      'food_nutrients',
    ]);
  });

  it("reads a user's favourites without a scan", () => {
    expectNoScan(favouritesQuery(db, 'u').compile(), ['favourites']);
  });

  it("removes a user's favourite with a search", () => {
    expectSearch(favouriteDeletion(db, 'u', 'f').compile(), 'favourites');
  });

  it("drops a deleted food's favourites with a search", () => {
    expectSearch(
      db.deleteFrom('favourites').where('food_id', '=', 'f').compile(),
      'favourites',
    );
  });

  it("lists a user's sign-in methods without a scan", () => {
    expectNoScan(signInMethodsQuery(db, 'u').compile(), ['accounts']);
  });

  it('sets a password without a scan', () => {
    expectNoScan(
      passwordCreation(db, 'u', {
        id: 'a',
        passwordHash: 'h',
        now: 't',
      }).compile(),
      ['accounts'],
    );
  });

  it('disconnects a sign-in method without a scan', () => {
    expectNoScan(signInMethodDisconnection(db, 'u', 'google').compile(), [
      'accounts',
    ]);
  });

  it("reads a user's latest weight with a search, newest first from the index", () => {
    const plan = planOf(latestMeasurementQuery(db, 'u', 'weight_kg').compile());
    expect(plan).toEqual([
      expect.stringMatching(/^SEARCH body_measurements USING INDEX/),
    ]);
    expect(
      planOf(
        latestMeasurementQuery(db, 'u', 'weight_kg', '2026-10-20').compile(),
      ),
    ).toEqual([expect.stringMatching(/^SEARCH body_measurements USING INDEX/)]);
  });

  it("lists a user's weights over a range with a search, in order from the index", () => {
    expect(
      planOf(
        measurementsQuery(db, 'u', {
          metric: 'weight_kg',
          from: '2026-10-01',
          to: '2026-10-31',
        }).compile(),
      ),
    ).toEqual([expect.stringMatching(/^SEARCH body_measurements USING INDEX/)]);
    expectSearch(
      measurementsQuery(db, 'u', { metric: 'weight_kg' }).compile(),
      'body_measurements',
    );
  });

  it("removes a user's measurement by id with a search", () => {
    expectSearch(
      measurementDeletion(db, 'u', 'm').compile(),
      'body_measurements',
    );
  });
});
