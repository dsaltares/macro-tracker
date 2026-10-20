import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { email } from '../../auth/credentials.ts';
import { deleteAccount } from '../../db/accounts.ts';
import { accountProcedure, router } from '../trpc.ts';

export const wrongConfirmation = 'That is not the address on this account.';

export const accountRouter = router({
  delete: accountProcedure
    .input(z.object({ email }))
    .mutation(async ({ ctx, input }) => {
      if (!(await deleteAccount(ctx.db, ctx.caller.userId, input.email))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: wrongConfirmation,
        });
      }
    }),
});
