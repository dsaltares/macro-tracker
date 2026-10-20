import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createApiKey, listApiKeys, revokeApiKey } from '../../db/api-keys.ts';
import { newApiKeySchema } from '../../domain/api-keys.ts';
import { accountProcedure, router } from '../trpc.ts';

export const apiKeysRouter = router({
  create: accountProcedure
    .input(newApiKeySchema)
    .mutation(({ ctx, input }) =>
      createApiKey(ctx.db, ctx.caller.userId, input, ctx),
    ),
  list: accountProcedure.query(({ ctx }) =>
    listApiKeys(ctx.db, ctx.caller.userId),
  ),
  revoke: accountProcedure
    .input(z.string().min(1))
    .mutation(async ({ ctx, input }) => {
      if (!(await revokeApiKey(ctx.db, ctx.caller.userId, input, ctx.now()))) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }),
});
