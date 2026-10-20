import { routes } from '../routes.ts';

export const nextParam = 'next';

export const errorParam = 'error';

export const emailParam = 'email';

const isInternalPath = (path: string) =>
  path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');

const authPaths: readonly string[] = [
  routes.signIn,
  routes.signUp,
  routes.verify,
  routes.forgotPassword,
  routes.resetPassword,
  routes.onboarding,
  routes.onboardingGoals,
];

const isAuthPath = (path: string) =>
  authPaths.includes(new URL(path, 'http://localhost').pathname);

const onwardPath = (next: string | null | undefined) =>
  next && isInternalPath(next) && !isAuthPath(next) ? next : undefined;

export const afterAuthPath = (next: string | null | undefined) =>
  onwardPath(next) ?? routes.home;

export const authUrl = (
  route: string,
  next?: string | null,
  extra: Record<string, string> = {},
) => {
  const onward = onwardPath(next);
  const query = new URLSearchParams({
    ...extra,
    ...(onward ? { [nextParam]: onward } : {}),
  }).toString();
  return query ? `${route}?${query}` : route;
};
