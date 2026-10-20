import { findProfile } from '../db/profiles.ts';
import { accountQuery } from '../db/users.ts';
import type { Profile } from '../domain/profile.ts';
import type { ServiceContext } from './context.ts';

export type Account = {
  id: string;
  email: string;
  name: string;
  profile: Profile | null;
};

export const findAccount = async ({
  db,
  caller,
}: Pick<ServiceContext, 'db' | 'caller'>): Promise<Account> => {
  const user = await accountQuery(db, caller.userId).executeTakeFirstOrThrow();
  return { ...user, profile: await findProfile(db, caller.userId) };
};
