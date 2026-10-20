import type { Kysely } from 'kysely';
import type { Profile } from '../domain/profile.ts';
import type { Database } from './schema.ts';

export const profileQuery = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('profiles')
    .select([
      'sex',
      'birth_date as birthDate',
      'height_cm as heightCm',
      'activity_level as activityLevel',
    ])
    .where('user_id', '=', userId);

export const findProfile = async (
  db: Kysely<Database>,
  userId: string,
): Promise<Profile | null> =>
  (await profileQuery(db, userId).executeTakeFirst()) ?? null;

export const saveProfile = async (
  db: Kysely<Database>,
  userId: string,
  { sex, birthDate, heightCm, activityLevel }: Profile,
  now: string,
): Promise<Profile> => {
  const fields = {
    sex,
    birth_date: birthDate,
    height_cm: heightCm,
    activity_level: activityLevel,
    updated_at: now,
  };
  await db
    .insertInto('profiles')
    .values({ user_id: userId, ...fields, created_at: now })
    .onConflict((conflict) => conflict.column('user_id').doUpdateSet(fields))
    .execute();
  return { sex, birthDate, heightCm, activityLevel };
};
