import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
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

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export const onlyParam = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
