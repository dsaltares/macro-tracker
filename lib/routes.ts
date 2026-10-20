export const routes = {
  home: '/',
  diary: '/diary',
  foods: '/foods',
  newFood: '/foods/new',
  trends: '/trends',
  body: '/body',
  onboarding: '/onboarding',
  settings: '/settings',
  profile: '/settings/profile',
  foodSources: '/settings/food-sources',
  account: '/settings/account',
  signIn: '/sign-in',
  signUp: '/sign-up',
  verify: '/verify',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  privacy: '/privacy',
  terms: '/terms',
  cookies: '/cookies',
} as const;

export const foodRoute = (id: string) =>
  `${routes.foods}/${encodeURIComponent(id)}`;
