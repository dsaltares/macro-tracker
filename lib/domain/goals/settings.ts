import { z } from 'zod';
import { nutrientVectorSchema } from '../foods/source-food.ts';
import type { NutrientVector } from '../nutrition/vector.ts';

export const goalModes = ['derived', 'manual'] as const;

export type GoalMode = (typeof goalModes)[number];

export const weeklyRateKgLimit = 2;
export const maxProteinGPerKg = 4;

export const goalSettingsSchema = z
  .object({
    mode: z.enum(goalModes),
    weeklyRateKg: z
      .number({ error: 'Enter a weekly rate in kg.' })
      .min(
        -weeklyRateKgLimit,
        `Enter a rate of at least -${weeklyRateKgLimit} kg a week.`,
      )
      .max(
        weeklyRateKgLimit,
        `Enter a rate of at most ${weeklyRateKgLimit} kg a week.`,
      ),
    proteinGPerKg: z
      .number({ error: 'Enter protein in g per kg.' })
      .min(0, 'Enter a protein target of at least 0 g per kg.')
      .max(
        maxProteinGPerKg,
        `Enter a protein target of at most ${maxProteinGPerKg} g per kg.`,
      ),
    fatEnergyShare: z
      .number({ error: 'Enter a fat share of energy.' })
      .min(0, 'Enter a fat share of at least 0%.')
      .max(1, 'Enter a fat share of at most 100%.'),
    overrides: nutrientVectorSchema,
  })
  .refine(
    ({ mode, overrides }) =>
      mode !== 'manual' || overrides.energy_kcal !== undefined,
    { message: 'Enter an energy target.', path: ['overrides', 'energy_kcal'] },
  );

export type GoalSettings = {
  mode: GoalMode;
  weeklyRateKg: number;
  proteinGPerKg: number;
  fatEnergyShare: number;
  overrides: NutrientVector;
};

export const defaultGoalSettings: GoalSettings = {
  mode: 'derived',
  weeklyRateKg: 0,
  proteinGPerKg: 1.6,
  fatEnergyShare: 0.3,
  overrides: {},
};
