import { redirect } from 'next/navigation';
import { afterAuthPath, nextParam } from '@/lib/auth/redirect';
import {
  currentSession,
  onlyParam,
  type SearchParams,
} from '@/lib/auth/session';

export const onwardIfSignedIn = async (searchParams: SearchParams) => {
  const parameters = await searchParams;
  if (await currentSession()) {
    redirect(afterAuthPath(onlyParam(parameters[nextParam])));
  }
  return parameters;
};
