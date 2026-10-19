import SQLite from 'better-sqlite3';
import { type CompiledQuery, Kysely, SqliteDialect } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});
