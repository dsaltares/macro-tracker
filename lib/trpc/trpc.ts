import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.ts';

const t = initTRPC.context<Context>().create();

export const router = t.router;

export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const signedInProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.caller === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, caller: ctx.caller } });
});
