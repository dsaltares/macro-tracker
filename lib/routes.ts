export const routes = {
  home: '/',
  diary: '/diary',
  nutrients: '/diary/nutrients',
  foods: '/foods',
  newFood: '/foods/new',
  trends: '/trends',
  body: '/body',
  onboarding: '/onboarding',
  onboardingGoals: '/onboarding/goals',
  settings: '/settings',
  profile: '/settings/profile',
  goals: '/settings/goals',
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

export const diaryHref = (date: string | null) =>
  date === null ? routes.diary : `${routes.diary}?date=${date}`;

export const nutrientsHref = (date: string) =>
  `${routes.nutrients}?date=${date}`;

export const foodRoute = (id: string) =>
  `${routes.foods}/${encodeURIComponent(id)}`;
