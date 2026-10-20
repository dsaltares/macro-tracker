import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('api_keys')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('prefix', 'text', (col) => col.notNull())
    .addColumn('key_hash', 'text', (col) => col.notNull())
    .addColumn('scopes', 'text', (col) =>
      col
        .notNull()
        .check(sql`json_valid(scopes) and json_type(scopes) = 'array'`),
    )
    .addColumn('last_used_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('revoked_at', 'text')
    .execute();
  await db.schema
    .createIndex('api_keys_key_hash')
    .on('api_keys')
    .column('key_hash')
    .unique()
    .execute();
  await db.schema
    .createIndex('api_keys_user_id_created_at')
    .on('api_keys')
    .columns(['user_id', 'created_at'])
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('api_keys').execute();
};
