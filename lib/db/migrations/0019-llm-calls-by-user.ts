import type { Kysely } from 'kysely';

// The trends read a user's model calls over a range of instants.
export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createIndex('llm_calls_user_id_created_at')
    .on('llm_calls')
    .columns(['user_id', 'created_at'])
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropIndex('llm_calls_user_id_created_at').execute();
};
