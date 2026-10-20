import { diaryRouter } from './routers/diary.ts';
import { foodRouter } from './routers/food.ts';
import { healthRouter } from './routers/health.ts';
import { profileRouter } from './routers/profile.ts';
import { createCallerFactory, router } from './trpc.ts';

export const appRouter = router({
  diary: diaryRouter,
  food: foodRouter,
  health: healthRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
