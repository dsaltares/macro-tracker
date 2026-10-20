import { z } from 'zod';
import { isDate } from '../../domain/dates.ts';
import type { Goal } from '../../domain/goals/goal.ts';
import {
  type GoalSettings,
  goalSettingsSchema,
} from '../../domain/goals/settings.ts';
import {
  findGoalOn,
  findGoalSettings,
  saveGoalSettings,
} from '../../services/goals.ts';
import { apiHandler } from '../handler.ts';

const settingsOf = ({
  mode,
  weeklyRateKg,
  proteinGPerKg,
  fatEnergyShare,
  overrides,
}: GoalSettings) => ({
  mode,
  weeklyRateKg,
  proteinGPerKg,
  fatEnergyShare,
  overrides,
});

const goalOf = ({ mode, weightKg, bmr, tdee, nutrients, warnings }: Goal) => ({
  mode,
  weightKg,
  bmr,
  tdee,
  nutrients,
  warnings,
});

export const goalsRoute = apiHandler({
  scope: 'read',
  input: z.object({
    date: z.string().refine(isDate, { message: 'Not a date' }),
  }),
  handle: async ({ context, input: { date } }) => {
    const [settings, goal] = await Promise.all([
      findGoalSettings(context),
      findGoalOn(context, date),
    ]);
    return {
      date,
      settings: settingsOf(settings),
      goal: goal && goalOf(goal),
    };
  },
});

export const setGoalsRoute = apiHandler({
  scope: 'write',
  input: goalSettingsSchema,
  handle: async ({ context, input }) =>
    settingsOf(await saveGoalSettings(context, input)),
});
