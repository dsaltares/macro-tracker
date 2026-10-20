import { hashPassword } from 'better-auth/crypto';
import type { Kysely } from 'kysely';
import { findProfile, saveProfile } from '../db/profiles.ts';
import type { Database } from '../db/schema.ts';
import { findUserIdByEmail, insertConfirmedUser } from '../db/users.ts';
import { devProfile, devUser } from './dev-user.ts';

export const refusedInProduction =
  'Refused: the dev user is never seeded under NODE_ENV=production';

export type SeedDevUserOptions = {
  db: Kysely<Database>;
  now: () => string;
  nextId: () => string;
  environment?: string | undefined;
};

export const seedDevUser = async ({
  db,
  now,
  nextId,
  environment = process.env.NODE_ENV,
}: SeedDevUserOptions) => {
  if (environment === 'production') {
    throw new Error(refusedInProduction);
  }
  const existing = await findUserIdByEmail(db, devUser.email);
  const userId = existing ?? nextId();
  if (existing === null) {
    await insertConfirmedUser(db, {
      id: userId,
      email: devUser.email,
      name: devUser.name,
      passwordHash: await hashPassword(devUser.password),
      now: now(),
    });
  }
  if (!(await findProfile(db, userId))) {
    await saveProfile(db, userId, devProfile, now());
  }
  return { created: existing === null };
};
