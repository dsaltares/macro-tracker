import { TRPCError } from '@trpc/server';
import { findProfile, saveProfile } from '../../db/profiles.ts';
import {
  birthDateOutOfRange,
  isPlausibleBirthDate,
  profileSchema,
} from '../../domain/profile.ts';
import { accountProcedure, router } from '../trpc.ts';

const dateOf = (timestamp: string) => timestamp.slice(0, 10);

export const profileRouter = router({
  get: accountProcedure.query(({ ctx }) =>
    findProfile(ctx.db, ctx.caller.userId),
  ),
  upsert: accountProcedure.input(profileSchema).mutation(({ ctx, input }) => {
    const now = ctx.now();
    if (!isPlausibleBirthDate(input.birthDate, dateOf(now))) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: birthDateOutOfRange,
      });
    }
    return saveProfile(ctx.db, ctx.caller.userId, input, now);
  }),
});
