import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('body_measurements')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('date', 'text', (col) =>
      col
        .notNull()
        .check(sql`date glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
    )
    .addColumn('metric', 'text', (col) =>
      col.notNull().check(sql`metric in ('weight_kg')`),
    )
    .addColumn('value', 'real', (col) => col.notNull().check(sql`value > 0`))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();
  await db.schema
    .createIndex('body_measurements_user_id_metric_date')
    .on('body_measurements')
    .columns(['user_id', 'metric', 'date'])
    .unique()
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('body_measurements').execute();
};
