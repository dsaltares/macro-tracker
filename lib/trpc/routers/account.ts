import { TRPCError } from '@trpc/server';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { email, newPasswordSchema } from '../../auth/credentials.ts';
import { deleteAccount } from '../../db/accounts.ts';
import {
  disconnectSignInMethod,
  findSignInMethods,
  setPassword,
  signInMethods,
} from '../../db/sign-in-methods.ts';
import { findAccount } from '../../services/account.ts';
import { accountProcedure, router } from '../trpc.ts';

export const wrongConfirmation = 'That is not the address on this account.';

export const passwordAlreadySet = 'This account already has a password.';

export const lastSignInMethod =
  'That is the only way to sign in to this account. Add another before disconnecting it.';

export const accountRouter = router({
  get: accountProcedure.query(({ ctx }) => findAccount(ctx)),
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
  signInMethods: accountProcedure.query(({ ctx }) =>
    findSignInMethods(ctx.db, ctx.caller.userId),
  ),
  setPassword: accountProcedure
    .input(newPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const created = await setPassword(ctx.db, ctx.caller.userId, {
        id: ctx.nextId(),
        passwordHash: await hashPassword(input.password),
        now: ctx.now(),
      });
      if (!created) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: passwordAlreadySet,
        });
      }
    }),
  disconnect: accountProcedure
    .input(z.object({ method: z.enum(signInMethods) }))
    .mutation(async ({ ctx, input }) => {
      const outcome = await disconnectSignInMethod(
        ctx.db,
        ctx.caller.userId,
        input.method,
      );
      if (outcome === 'last-method') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: lastSignInMethod });
      }
    }),
});
