import { type Kysely, sql } from 'kysely';

const now = sql`CURRENT_TIMESTAMP`;

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('email_verified', 'integer', (col) =>
      col.notNull().defaultTo(0).check(sql`email_verified in (0, 1)`),
    )
    .addColumn('image', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema
    .createTable('sessions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('token', 'text', (col) => col.notNull().unique())
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('ip_address', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(now))
    .execute();
  await db.schema
    .createIndex('sessions_user_id')
    .on('sessions')
    .column('user_id')
    .execute();

  await db.schema
    .createTable('accounts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('account_id', 'text', (col) => col.notNull())
    .addColumn('provider_id', 'text', (col) => col.notNull())
    .addColumn('access_token', 'text')
    .addColumn('refresh_token', 'text')
    .addColumn('id_token', 'text')
    .addColumn('access_token_expires_at', 'text')
    .addColumn('refresh_token_expires_at', 'text')
    .addColumn('scope', 'text')
    .addColumn('password', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(now))
    .execute();
  await db.schema
    .createIndex('accounts_user_id')
    .on('accounts')
    .column('user_id')
    .execute();

  await db.schema
    .createTable('verifications')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('identifier', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(now))
    .execute();
  await db.schema
    .createIndex('verifications_identifier')
    .on('verifications')
    .column('identifier')
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('verifications').execute();
  await db.schema.dropTable('accounts').execute();
  await db.schema.dropTable('sessions').execute();
  await db.schema.dropTable('users').execute();
};
