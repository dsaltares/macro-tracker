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

const everyMigration = ['0001-meta', '0002-foods'];

const everyTable = [
  'food_nutrients',
  'food_portions',
  'foods',
  'foods_fts',
  'foods_fts_config',
  'foods_fts_data',
  'foods_fts_docsize',
  'foods_fts_idx',
  'meta',
];

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

  it('rolls back one migration on the way down', async () => {
    await migrateToLatest(db);

    expect(await migrateDown(db)).toEqual(['0002-foods']);
    expect(await tableNames(db)).toEqual(['meta']);
  });

  it('can go up again after coming down', async () => {
    await migrateToLatest(db);
    await migrateDown(db);

    expect(await migrateToLatest(db)).toEqual(['0002-foods']);
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
