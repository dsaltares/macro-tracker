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
];

const everyTable = [
  'accounts',
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
  'meta',
  'sessions',
  'users',
  'verifications',
];

const accountTables = ['accounts', 'sessions', 'users', 'verifications'];

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

  it('rolls back one migration on the way down', async () => {
    await migrateToLatest(db);

    expect(await migrateDown(db)).toEqual(['0007-food-import-history']);
    expect(await tableNames(db)).toEqual(everyTable);

    expect(await migrateDown(db)).toEqual(['0006-accounts']);
    expect(await tableNames(db)).toEqual(
      everyTable.filter((table) => !accountTables.includes(table)),
    );
  });

  it('can go up again after coming down', async () => {
    await migrateToLatest(db);
    await migrateDown(db);

    expect(await migrateToLatest(db)).toEqual(['0007-food-import-history']);
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
