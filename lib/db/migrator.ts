import type { Kysely } from 'kysely';
import { type Migration, Migrator } from 'kysely/migration';
import { getDatabase } from './client.ts';
import * as meta from './migrations/0001-meta.ts';
import * as foods from './migrations/0002-foods.ts';
import * as foodImports from './migrations/0003-food-imports.ts';
import * as foodOriginalNames from './migrations/0004-food-original-names.ts';
import * as foodSourcePreferences from './migrations/0005-food-source-preferences.ts';
import * as accounts from './migrations/0006-accounts.ts';
import * as foodImportHistory from './migrations/0007-food-import-history.ts';
import type { Database } from './schema.ts';

const migrations: Record<string, Migration> = {
  '0001-meta': meta,
  '0002-foods': foods,
  '0003-food-imports': foodImports,
  '0004-food-original-names': foodOriginalNames,
  '0005-food-source-preferences': foodSourcePreferences,
  '0006-accounts': accounts,
  '0007-food-import-history': foodImportHistory,
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
