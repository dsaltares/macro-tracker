import type { Kysely } from 'kysely';
import { afterEach, beforeEach } from 'vitest';
import { createDatabase } from '@/lib/db/client';
import { migrateToLatest } from '@/lib/db/migrator';
import type { Database } from '@/lib/db/schema';
import { inMemory } from '@/lib/db/url';

export const migratedDatabasePerTest = () => {
  let db: Kysely<Database> | undefined;

  beforeEach(async () => {
    db = createDatabase(inMemory);
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  return () => {
    if (!db) {
      throw new Error(
        'migratedDatabasePerTest() hands out its database only inside a test',
      );
    }
    return db;
  };
};
