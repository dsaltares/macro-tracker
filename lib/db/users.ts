import type { Kysely } from 'kysely';
import type { Database } from './schema.ts';

export type ConfirmedUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  now: string;
};

export const findUserIdByEmail = async (db: Kysely<Database>, email: string) =>
  (
    await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst()
  )?.id ?? null;

export const insertConfirmedUser = (
  db: Kysely<Database>,
  { id, email, name, passwordHash, now }: ConfirmedUser,
) =>
  db.transaction().execute(async (trx) => {
    const at = { created_at: now, updated_at: now };
    await trx
      .insertInto('users')
      .values({
        id,
        email,
        name,
        email_verified: 1,
        terms_accepted_at: now,
        ...at,
      })
      .execute();
    await trx
      .insertInto('accounts')
      .values({
        id: `${id}-credential`,
        user_id: id,
        account_id: id,
        provider_id: 'credential',
        password: passwordHash,
        ...at,
      })
      .execute();
  });

export const accountQuery = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('users')
    .select(['id', 'email', 'name'])
    .where('id', '=', userId);
