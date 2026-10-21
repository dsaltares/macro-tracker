import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('history_imports')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('source', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col.notNull().check(sql`status in ('running', 'succeeded', 'failed')`),
    )
    .addColumn('phase', 'text', (col) =>
      col
        .notNull()
        .check(sql`phase in ('reading', 'matching', 'logging', 'weights')`),
    )
    .addColumn('done', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('total', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('summary', 'text', (col) =>
      col.check(sql`summary is null or json_valid(summary)`),
    )
    .addColumn('error', 'text')
    .addColumn('started_at', 'text', (col) => col.notNull())
    .addColumn('finished_at', 'text')
    .execute();
  await db.schema
    .createIndex('history_imports_one_running_per_user')
    .unique()
    .on('history_imports')
    .column('user_id')
    .where(sql.ref('status'), '=', 'running')
    .execute();
  await db.schema
    .createIndex('history_imports_user_id_started_at')
    .on('history_imports')
    .columns(['user_id', 'started_at'])
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('history_imports').execute();
};
