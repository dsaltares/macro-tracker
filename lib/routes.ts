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
  export: '/settings/export',
  exportDiary: '/api/export/diary.csv',
  exportWeights: '/api/export/weights.csv',
  exportAll: '/api/export/all.json',
  labelScan: '/api/label-scan',
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

export const newFoodHref = ({
  barcode,
  scanLabel = false,
}: {
  barcode?: string;
  scanLabel?: boolean;
}) => {
  const params = new URLSearchParams([
    ...(barcode === undefined ? [] : [['barcode', barcode]]),
    ...(scanLabel ? [['scan', 'label']] : []),
  ]);
  return params.size === 0 ? routes.newFood : `${routes.newFood}?${params}`;
};

export const foodRoute = (id: string) =>
  `${routes.foods}/${encodeURIComponent(id)}`;
