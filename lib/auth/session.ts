import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDatabase } from '../db/client.ts';
import { findProfile } from '../db/profiles.ts';
import { requestPathHeader } from '../request-path.ts';
import { routes } from '../routes.ts';
import { getAuth } from './auth.ts';
import { authUrl } from './redirect.ts';

export const currentSession = cache(async () => {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return session?.user.emailVerified ? session : null;
});

const requestedPath = async () =>
  (await headers()).get(requestPathHeader) ?? routes.home;

export const requireSession = async () => {
  const session = await currentSession();
  if (!session) {
    redirect(authUrl(routes.signIn, await requestedPath()));
  }
  return session;
};

const profileOf = cache((userId: string) => findProfile(getDatabase(), userId));

export const requireProfile = async () => {
  const session = await requireSession();
  const profile = await profileOf(session.user.id);
  if (!profile) {
    redirect(authUrl(routes.onboarding, await requestedPath()));
  }
  return { ...session, profile };
};

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export const onlyParam = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
