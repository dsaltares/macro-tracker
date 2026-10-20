import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('goals')
    .addColumn('user_id', 'text', (col) =>
      col.primaryKey().references('users.id').onDelete('cascade'),
    )
    .addColumn('mode', 'text', (col) =>
      col.notNull().check(sql`mode in ('derived', 'manual')`),
    )
    .addColumn('weekly_rate_kg', 'real', (col) => col.notNull())
    .addColumn('protein_g_per_kg', 'real', (col) =>
      col.notNull().check(sql`protein_g_per_kg >= 0`),
    )
    .addColumn('fat_energy_share', 'real', (col) =>
      col.notNull().check(sql`fat_energy_share between 0 and 1`),
    )
    .addColumn('overrides', 'text', (col) =>
      col
        .notNull()
        .check(sql`json_valid(overrides) and json_type(overrides) = 'object'`),
    )
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('goals').execute();
};
