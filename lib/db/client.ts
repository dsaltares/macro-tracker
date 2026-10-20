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
const bulkCacheKib = 256 * 1024;

export type DatabaseOptions = {
  // For the food importer's own connection: a large page cache, and no fsync on each commit
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
  if (bulkWrites) {
    database.pragma('synchronous = NORMAL');
    database.pragma(`cache_size = -${bulkCacheKib}`);
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
