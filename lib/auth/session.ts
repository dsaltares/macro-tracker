import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDatabase } from '../db/client.ts';
import { findProfile } from '../db/profiles.ts';
import { routes } from '../routes.ts';
import { getAuth } from './auth.ts';
import { authUrl } from './redirect.ts';

export const currentSession = async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.emailVerified ? session : null;
};

export const requireSession = async (here: string) => {
  const session = await currentSession();
  if (!session) {
    redirect(authUrl(routes.signIn, here));
  }
  return session;
};

export const requireProfile = async (here: string) => {
  const session = await requireSession(here);
  const profile = await findProfile(getDatabase(), session.user.id);
  if (!profile) {
    redirect(authUrl(routes.onboarding, here));
  }
  return { ...session, profile };
};

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export const onlyParam = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
