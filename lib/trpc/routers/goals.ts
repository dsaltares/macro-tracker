import { z } from 'zod';
import {
  findGoalOn,
  findGoalSettings,
  saveGoalSettings,
} from '../../db/goals.ts';
import { isDate } from '../../domain/dates.ts';
import { goalSettingsSchema } from '../../domain/goals/settings.ts';
import { accountProcedure, router } from '../trpc.ts';

const dateInput = z.string().refine(isDate, { message: 'Not a date' });

export const goalsRouter = router({
  get: accountProcedure.query(({ ctx }) =>
    findGoalSettings(ctx.db, ctx.caller.userId),
  ),
  set: accountProcedure
    .input(goalSettingsSchema)
    .mutation(({ ctx, input }) =>
      saveGoalSettings(ctx.db, ctx.caller.userId, input, ctx.now()),
    ),
  forDate: accountProcedure
    .input(dateInput)
    .query(({ ctx, input }) => findGoalOn(ctx.db, ctx.caller.userId, input)),
});
