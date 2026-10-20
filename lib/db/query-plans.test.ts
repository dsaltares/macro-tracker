import SQLite from 'better-sqlite3';
import { type CompiledQuery, Kysely, SqliteDialect } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userPortionDeletion } from './food-portions.ts';
import {
  foodByBarcodeQuery,
  foodByIdQuery,
  portionsQuery,
  searchQuery,
} from './food-search.ts';
import {
  liveFoodCountsQuery,
  sourcePreferencesQuery,
} from './food-source-preferences.ts';
import { migrateToLatest } from './migrator.ts';
import type { Database } from './schema.ts';

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
});
