import type { Meal } from './domain/diary/entries.ts';

export const routes = {
  home: '/',
  diary: '/diary',
  nutrients: '/diary/nutrients',
  foods: '/foods',
  newFood: '/foods/new',
  trends: '/trends',
  body: '/body',
  nutrientReport: '/trends/nutrients',
  onboarding: '/onboarding',
  onboardingGoals: '/onboarding/goals',
  settings: '/settings',
  profile: '/settings/profile',
  goals: '/settings/goals',
  foodSources: '/settings/food-sources',
  apiKeys: '/settings/api-keys',
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

export type DiaryMeal = { date: string; meal: Meal };

export const addToDiaryHref = ({
  date,
  meal,
  foodId,
}: DiaryMeal & { foodId: string }) =>
  `${routes.diary}?${new URLSearchParams({ date, meal, food: foodId })}`;

export const nutrientsHref = (date: string) =>
  `${routes.nutrients}?date=${date}`;

export const newFoodHref = ({
  barcode,
  scanLabel = false,
  diary,
}: {
  barcode?: string;
  scanLabel?: boolean;
  diary?: DiaryMeal;
}) => {
  const params = new URLSearchParams([
    ...(barcode === undefined ? [] : [['barcode', barcode]]),
    ...(scanLabel ? [['scan', 'label']] : []),
    ...(diary === undefined
      ? []
      : [
          ['date', diary.date],
          ['meal', diary.meal],
        ]),
  ]);
  return params.size === 0 ? routes.newFood : `${routes.newFood}?${params}`;
};

export const foodRoute = (id: string) =>
  `${routes.foods}/${encodeURIComponent(id)}`;
