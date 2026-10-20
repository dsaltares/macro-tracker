import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from './client.ts';
import { migrateDown, migrateToLatest } from './migrator.ts';
import { inMemory } from './url.ts';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'macro-tracker-migrator-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const isOurs = (name: string) => !name.startsWith('kysely_');

const tableNames = async (db: ReturnType<typeof createDatabase>) =>
  (await db.introspection.getTables())
    .map(({ name }) => name)
    .filter(isOurs)
    .sort();

const everyMigration = [
  '0001-meta',
  '0002-foods',
  '0003-food-imports',
  '0004-food-original-names',
  '0005-food-source-preferences',
  '0006-accounts',
  '0007-food-import-history',
  '0008-terms-accepted',
  '0009-profiles',
  '0010-diary',
  '0011-account-deletion',
  '0012-body-measurements',
  '0013-goals',
  '0014-recipes',
  '0015-api-keys',
];

const everyTable = [
  'accounts',
  'api_keys',
  'body_measurements',
  'diary_entries',
  'favourites',
  'food_imports',
  'food_nutrients',
  'food_portions',
  'food_source_preferences',
  'foods',
  'foods_fts',
  'foods_fts_config',
  'foods_fts_data',
  'foods_fts_docsize',
  'foods_fts_idx',
  'goals',
  'meta',
  'profiles',
  'recipe_ingredients',
  'recipes',
  'sessions',
  'users',
  'verifications',
];

const accountTables = ['accounts', 'sessions', 'users', 'verifications'];

const diaryTables = ['diary_entries', 'favourites'];

const recipeTables = ['recipe_ingredients', 'recipes'];

const undo = async (
  db: ReturnType<typeof createDatabase>,
  migration: string,
) => {
  for (;;) {
    const undone = await migrateDown(db);
    if (undone.includes(migration)) {
      return;
    }
    if (undone.length === 0) {
      throw new Error(`${migration} was never applied`);
    }
  }
};

const targets = [
  ['in memory', () => inMemory],
  ['in a file', () => join(directory, 'db.sqlite')],
] as const;

describe.each(targets)('migrations %s', (_, url) => {
  let db: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    db = createDatabase(url());
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('applies every migration on the way up', async () => {
    expect(await migrateToLatest(db)).toEqual(everyMigration);
    expect(await tableNames(db)).toEqual(everyTable);
  });

  it('applies nothing when already at the latest', async () => {
    await migrateToLatest(db);

    expect(await migrateToLatest(db)).toEqual([]);
  });

  it('keeps the foods already there searchable across original names, both ways', async () => {
    const search = async (query: string) =>
      (
        await sql<{ name: string }>`
          select name from foods_fts where foods_fts match ${query}
        `.execute(db)
      ).rows.map(({ name }) => name);
    await migrateToLatest(db);
    await migrateDown(db);
    await sql`
      insert into foods (id, source, source_id, name, created_at, updated_at)
      values ('food-1', 'off', '3017620422003', 'Nutella', '2026-10-19', '2026-10-19')
    `.execute(db);

    await migrateToLatest(db);
    expect(await search('nutella')).toEqual(['Nutella']);

    await migrateDown(db);
    expect(await search('nutella')).toEqual(['Nutella']);
  });

  it('keeps the source preferences of existing users across the rebuild, both ways, and drops the rest', async () => {
    const preferences = () =>
      db
        .selectFrom('food_source_preferences')
        .select(['user_id', 'source', 'enabled', 'position'])
        .orderBy('user_id')
        .execute();
    await migrateToLatest(db);
    await undo(db, '0011-account-deletion');
    await db
      .insertInto('users')
      .values({ id: 'user-1', name: 'user-1', email: 'user-1@example.test' })
      .execute();
    await db
      .insertInto('food_source_preferences')
      .values([
        { user_id: 'user-1', source: 'usda', enabled: 0, position: 2 },
        { user_id: 'gone', source: 'usda', enabled: 1, position: 0 },
      ])
      .execute();
    const kept = [
      { user_id: 'user-1', source: 'usda', enabled: 0, position: 2 },
    ];

    await migrateToLatest(db);
    expect(await preferences()).toEqual(kept);

    await undo(db, '0011-account-deletion');
    expect(await preferences()).toEqual(kept);
  });

  it('rolls back one migration on the way down', async () => {
    await migrateToLatest(db);

    expect(await migrateDown(db)).toEqual(['0015-api-keys']);
    const beforeApiKeys = everyTable.filter((table) => table !== 'api_keys');
    expect(await tableNames(db)).toEqual(beforeApiKeys);

    expect(await migrateDown(db)).toEqual(['0014-recipes']);
    const beforeRecipes = beforeApiKeys.filter(
      (table) => !recipeTables.includes(table),
    );
    expect(await tableNames(db)).toEqual(beforeRecipes);

    expect(await migrateDown(db)).toEqual(['0013-goals']);
    const beforeGoals = beforeRecipes.filter((table) => table !== 'goals');
    expect(await tableNames(db)).toEqual(beforeGoals);

    expect(await migrateDown(db)).toEqual(['0012-body-measurements']);
    const beforeBody = beforeGoals.filter(
      (table) => table !== 'body_measurements',
    );
    expect(await tableNames(db)).toEqual(beforeBody);

    expect(await migrateDown(db)).toEqual(['0011-account-deletion']);
    expect(await tableNames(db)).toEqual(beforeBody);

    expect(await migrateDown(db)).toEqual(['0010-diary']);
    const withoutDiary = beforeBody.filter(
      (table) => !diaryTables.includes(table),
    );
    expect(await tableNames(db)).toEqual(withoutDiary);

    const beforeProfiles = withoutDiary.filter((table) => table !== 'profiles');

    expect(await migrateDown(db)).toEqual(['0009-profiles']);
    expect(await tableNames(db)).toEqual(beforeProfiles);

    expect(await migrateDown(db)).toEqual(['0008-terms-accepted']);
    expect(await tableNames(db)).toEqual(beforeProfiles);

    expect(await migrateDown(db)).toEqual(['0007-food-import-history']);
    expect(await tableNames(db)).toEqual(beforeProfiles);

    expect(await migrateDown(db)).toEqual(['0006-accounts']);
    expect(await tableNames(db)).toEqual(
      beforeProfiles.filter((table) => !accountTables.includes(table)),
    );
  });

  it('can go up again after coming down', async () => {
    await migrateToLatest(db);
    await migrateDown(db);

    expect(await migrateToLatest(db)).toEqual(['0015-api-keys']);
  });

  it('reads back what is written to meta', async () => {
    await migrateToLatest(db);
    await db
      .insertInto('meta')
      .values({ key: 'greeting', value: 'hello' })
      .execute();

    expect(
      await db
        .selectFrom('meta')
        .select('value')
        .where('key', '=', 'greeting')
        .executeTakeFirst(),
    ).toEqual({ value: 'hello' });
  });

  it('enforces foreign keys', async () => {
    const { rows } = await sql<{
      foreign_keys: number;
    }>`pragma foreign_keys`.execute(db);

    expect(rows).toEqual([{ foreign_keys: 1 }]);
  });

  it('waits on a busy database instead of failing at once', async () => {
    const { rows } = await sql<{
      timeout: number;
    }>`pragma busy_timeout`.execute(db);

    expect(rows).toEqual([{ timeout: 5000 }]);
  });
});

describe('a database in a file', () => {
  it('journals in WAL mode', async () => {
    const db = createDatabase(join(directory, 'db.sqlite'));
    const { rows } = await sql<{
      journal_mode: string;
    }>`pragma journal_mode`.execute(db);
    await db.destroy();

    expect(rows).toEqual([{ journal_mode: 'wal' }]);
  });

  it('creates the directory it lives in', async () => {
    const db = createDatabase(join(directory, 'nested', 'db.sqlite'));
    await migrateToLatest(db);
    await db.destroy();

    const reopened = createDatabase(join(directory, 'nested', 'db.sqlite'));
    expect(await tableNames(reopened)).toEqual(everyTable);
    await reopened.destroy();
  });
});
