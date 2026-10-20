import { z } from 'zod';
import { dateSchema } from '../../domain/dates.ts';
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
import { goal, goalSettings } from '../schemas.ts';

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

const exampleSettings = {
  mode: 'derived' as const,
  weeklyRateKg: -0.25,
  proteinGPerKg: 1.6,
  fatEnergyShare: 0.3,
  overrides: { fibre: 30 },
};

export const goalsRoute = apiHandler({
  method: 'GET',
  path: '/goals',
  operationId: 'getGoals',
  summary: 'Get the goal for a day',
  description:
    'The goal settings and the goal they give on a date: energy from the profile and the latest weight on or before that date, macros from the settings, micronutrients from the dietary reference values, then the overrides. The goal is null without a profile, or without a weight for a derived goal.',
  scope: 'read',
  input: z.object({
    date: dateSchema.describe('The day the goal is for.'),
  }),
  output: z.object({
    date: dateSchema,
    settings: goalSettings,
    goal: goal.nullable(),
  }),
  example: {
    input: { date: '2026-10-20' },
    response: {
      date: '2026-10-20',
      settings: exampleSettings,
      goal: {
        mode: 'derived',
        weightKg: 71.4,
        bmr: 1452,
        tdee: 2251,
        nutrients: {
          energy_kcal: 1976,
          protein: 114.2,
          fat: 65.9,
          carbohydrate: 231.5,
          fibre: 30,
          sodium: 2000,
          calcium: 950,
          iron: 16,
          vitamin_c: 95,
          vitamin_d: 15,
        },
        warnings: [],
      },
    },
  },
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
  method: 'PUT',
  path: '/goals',
  operationId: 'setGoals',
  summary: 'Set the goal settings',
  description:
    'Replace the goal settings. In derived mode the energy and macros follow the body and the rates; in manual mode overrides.energy_kcal is required and the macro overrides stand as given. Any other override is a micronutrient goal set by hand.',
  scope: 'write',
  input: goalSettingsSchema,
  output: goalSettings,
  example: { input: exampleSettings, response: exampleSettings },
  handle: async ({ context, input }) =>
    settingsOf(await saveGoalSettings(context, input)),
});
