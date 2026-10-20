import type { NutrientVector } from '../nutrition/vector.ts';
import type { Profile } from '../profile.ts';
import { derivedGoal, type GoalWarning } from './derived.ts';
import { defaultMicroGoals } from './drv.ts';
import type { GoalMode, GoalSettings } from './settings.ts';

export type Goal = {
  mode: GoalMode;
  weightKg: number | null;
  bmr: number | null;
  tdee: number | null;
  nutrients: NutrientVector;
  warnings: GoalWarning[];
};

const manualGoal = (
  profile: Profile,
  weightKg: number | null,
  date: string,
  { overrides }: GoalSettings,
): Goal | null => {
  if (overrides.energy_kcal === undefined) return null;
  return {
    mode: 'manual',
    weightKg,
    bmr: null,
    tdee: null,
    nutrients: {
      ...defaultMicroGoals(profile, date, overrides.energy_kcal),
      ...overrides,
    },
    warnings: [],
  };
};

const derivedGoalWithMicros = (
  profile: Profile,
  weightKg: number | null,
  date: string,
  settings: GoalSettings,
): Goal | null => {
  if (weightKg === null) return null;
  const { bmr, tdee, kcal, nutrients, warnings } = derivedGoal(
    profile,
    weightKg,
    date,
    settings,
  );
  return {
    mode: 'derived',
    weightKg,
    bmr,
    tdee,
    nutrients: {
      ...defaultMicroGoals(profile, date, kcal),
      ...nutrients,
      ...settings.overrides,
    },
    warnings,
  };
};

export const goalOn = (
  profile: Profile,
  weightKg: number | null,
  date: string,
  settings: GoalSettings,
): Goal | null =>
  settings.mode === 'manual'
    ? manualGoal(profile, weightKg, date, settings)
    : derivedGoalWithMicros(profile, weightKg, date, settings);
