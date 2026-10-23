import { type Kysely, sql } from 'kysely';

// Search ranks matches in the full-text index and leaves out the archived foods by rowid,
// found here rather than by reading every match's row.
export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createIndex('foods_archived')
    .on('foods')
    .column('archived_at')
    .where(sql.ref('archived_at'), 'is not', null)
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropIndex('foods_archived').execute();
};
