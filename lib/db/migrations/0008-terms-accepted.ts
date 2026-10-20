import type { Kysely } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .alterTable('users')
    .addColumn('terms_accepted_at', 'text')
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.alterTable('users').dropColumn('terms_accepted_at').execute();
};
