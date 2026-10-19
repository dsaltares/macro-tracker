import type { Kysely } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('meta')
    .addColumn('key', 'text', (col) => col.notNull().primaryKey())
    .addColumn('value', 'text', (col) => col.notNull())
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('meta').execute();
};
