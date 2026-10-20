import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('profiles')
    .addColumn('user_id', 'text', (col) =>
      col.primaryKey().references('users.id').onDelete('cascade'),
    )
    .addColumn('sex', 'text', (col) =>
      col.notNull().check(sql`sex in ('female', 'male')`),
    )
    .addColumn('birth_date', 'text', (col) => col.notNull())
    .addColumn('height_cm', 'real', (col) =>
      col.notNull().check(sql`height_cm > 0`),
    )
    .addColumn('activity_level', 'text', (col) =>
      col
        .notNull()
        .check(
          sql`activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')`,
        ),
    )
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('profiles').execute();
};
