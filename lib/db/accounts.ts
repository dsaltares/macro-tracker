import type { Kysely } from 'kysely';
import type { Database } from './schema.ts';

export const accountDeletion = (
  db: Kysely<Database>,
  userId: string,
  email: string,
) => db.deleteFrom('users').where('id', '=', userId).where('email', '=', email);

export const deleteAccount = async (
  db: Kysely<Database>,
  userId: string,
  email: string,
) => {
  const { numDeletedRows } = await accountDeletion(
    db,
    userId,
    email,
  ).executeTakeFirstOrThrow();
  return numDeletedRows > 0n;
};
