import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.ts';
import { databaseUrl, inMemory } from './url.ts';

const busyTimeoutMs = 5000;

export const createDatabase = (url: string = databaseUrl()) => {
  if (url !== inMemory) {
    mkdirSync(dirname(url), { recursive: true });
  }
  const database = new SQLite(url);
  database.pragma('journal_mode = WAL');
  database.pragma(`busy_timeout = ${busyTimeoutMs}`);
  database.pragma('foreign_keys = ON');
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database }),
  });
};

let instance: Kysely<Database> | undefined;

export const getDatabase = () => {
  instance ??= createDatabase();
  return instance;
};
