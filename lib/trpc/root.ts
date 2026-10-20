import { accountRouter } from './routers/account.ts';
import { apiKeysRouter } from './routers/api-keys.ts';
import { bodyRouter } from './routers/body.ts';
import { diaryRouter } from './routers/diary.ts';
import { foodRouter } from './routers/food.ts';
import { goalsRouter } from './routers/goals.ts';
import { healthRouter } from './routers/health.ts';
import { profileRouter } from './routers/profile.ts';
import { recipeRouter } from './routers/recipe.ts';
import { trendsRouter } from './routers/trends.ts';
import { createCallerFactory, router } from './trpc.ts';

export const appRouter = router({
  account: accountRouter,
  apiKeys: apiKeysRouter,
  body: bodyRouter,
  diary: diaryRouter,
  food: foodRouter,
  goals: goalsRouter,
  health: healthRouter,
  profile: profileRouter,
  recipe: recipeRouter,
  trends: trendsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
