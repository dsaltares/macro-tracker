import type { Kysely } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createIndex('food_imports_by_status')
    .on('food_imports')
    .columns(['status', 'started_at'])
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropIndex('food_imports_by_status').execute();
};
