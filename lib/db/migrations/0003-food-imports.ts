import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('food_imports')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('sources', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col
        .notNull()
        .check(sql`status in ('queued', 'running', 'succeeded', 'failed')`),
    )
    .addColumn('started_at', 'text')
    .addColumn('finished_at', 'text')
    .addColumn('inserted', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('updated', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('archived', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('error', 'text')
    .execute();
  await db.schema
    .createIndex('food_imports_one_running')
    .unique()
    .on('food_imports')
    .column('status')
    .where(sql.ref('status'), '=', 'running')
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('food_imports').execute();
};
