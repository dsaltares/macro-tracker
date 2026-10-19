import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('food_source_preferences')
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('source', 'text', (col) =>
      col.notNull().check(sql`source in ('ciqual', 'cofid', 'usda')`),
    )
    .addColumn('enabled', 'integer', (col) =>
      col.notNull().check(sql`enabled in (0, 1)`),
    )
    .addColumn('position', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('food_source_preferences_pk', [
      'user_id',
      'source',
    ])
    .execute();
  await db.schema
    .createIndex('foods_live_source')
    .on('foods')
    .columns(['source', 'archived_at'])
    .where(sql.ref('archived_at'), 'is', null)
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropIndex('foods_live_source').execute();
  await db.schema.dropTable('food_source_preferences').execute();
};
