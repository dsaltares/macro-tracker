import { z } from 'zod';
import { isDate } from '../../domain/dates.ts';
import { goalSettingsSchema } from '../../domain/goals/settings.ts';
import {
  findGoalOn,
  findGoalSettings,
  saveGoalSettings,
} from '../../services/goals.ts';
import { accountProcedure, router } from '../trpc.ts';

const dateInput = z.string().refine(isDate, { message: 'Not a date' });

export const goalsRouter = router({
  get: accountProcedure.query(({ ctx }) => findGoalSettings(ctx)),
  set: accountProcedure
    .input(goalSettingsSchema)
    .mutation(({ ctx, input }) => saveGoalSettings(ctx, input)),
  forDate: accountProcedure
    .input(dateInput)
    .query(({ ctx, input }) => findGoalOn(ctx, input)),
});
