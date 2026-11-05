import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.ts';
import { databaseUrl, inMemory } from './url.ts';

const busyTimeoutMs = 5000;
// A checkpoint truncates the WAL back to this, so one long import doesn't leave it hundreds of
// megabytes long.
const walSizeLimitBytes = 64 * 1024 * 1024;
// Room for the full-text index (about 115 MB), of which food search reads thousands of pages for
// a common word; at SQLite's default 2 MB each search read them again from disk. Pages fill in as
// they're read, so a connection that never searches doesn't use it.
const cacheKib = 256 * 1024;

export type DatabaseOptions = {
  // For the food importer's own connection: no fsync on each commit
  // (WAL stays consistent; a power cut may lose the last batches, which the next run rewrites).
  bulkWrites?: boolean;
};

export const createDatabase = (
  url: string = databaseUrl(),
  { bulkWrites = false }: DatabaseOptions = {},
) => {
  if (url !== inMemory) {
    mkdirSync(dirname(url), { recursive: true });
  }
  const database = new SQLite(url);
  database.pragma('journal_mode = WAL');
  database.pragma(`busy_timeout = ${busyTimeoutMs}`);
  database.pragma('foreign_keys = ON');
  database.pragma(`journal_size_limit = ${walSizeLimitBytes}`);
  database.pragma(`cache_size = -${cacheKib}`);
  if (bulkWrites) {
    database.pragma('synchronous = NORMAL');
  }
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database }),
  });
};

let instance: Kysely<Database> | undefined;

export const getDatabase = () => {
  instance ??= createDatabase();
  return instance;
};
