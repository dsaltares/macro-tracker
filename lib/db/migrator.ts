import type { Kysely } from 'kysely';
import { type Migration, Migrator } from 'kysely/migration';
import { getDatabase } from './client.ts';
import * as meta from './migrations/0001-meta.ts';
import * as foods from './migrations/0002-foods.ts';
import type { Database } from './schema.ts';

const migrations: Record<string, Migration> = {
  '0001-meta': meta,
  '0002-foods': foods,
};

const createMigrator = (db: Kysely<Database> = getDatabase()) =>
  new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });

const appliedNames = ({
  error,
  results,
}: Awaited<ReturnType<Migrator['migrateToLatest']>>) => {
  if (error) {
    throw error;
  }
  return (results ?? []).map(({ migrationName }) => migrationName);
};

export const migrateToLatest = async (db?: Kysely<Database>) =>
  appliedNames(await createMigrator(db).migrateToLatest());

export const migrateDown = async (db?: Kysely<Database>) =>
  appliedNames(await createMigrator(db).migrateDown());
