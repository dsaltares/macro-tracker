import type { Caller } from '../trpc/context.ts';
import { type Auth, getAuth } from './auth.ts';

export const resolveCaller = async (
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<Caller | null> => {
  const session = await auth.api.getSession({ headers });
  if (!session?.user.emailVerified) {
    return null;
  }
  return { userId: session.user.id };
};
