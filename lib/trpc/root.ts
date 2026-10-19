import { healthRouter } from './routers/health.ts';
import { createCallerFactory, router } from './trpc.ts';

export const appRouter = router({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
