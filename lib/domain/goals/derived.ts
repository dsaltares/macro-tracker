import type { NutrientVector } from '../nutrition/vector.ts';
import type { Profile } from '../profile.ts';
import { type EnergyWarning, energyGoal } from './energy.ts';
import { type MacroSplit, type MacroWarning, macroGoal } from './macros.ts';

export type DerivedGoalSettings = MacroSplit & { weeklyRateKg: number };

export type GoalWarning = EnergyWarning | MacroWarning;

export type DerivedGoal = {
  bmr: number;
  tdee: number;
  kcal: number;
  nutrients: NutrientVector;
  warnings: GoalWarning[];
};

export const derivedGoal = (
  profile: Profile,
  weightKg: number,
  date: string,
  { weeklyRateKg, ...split }: DerivedGoalSettings,
): DerivedGoal => {
  const energy = energyGoal(profile, weightKg, date, weeklyRateKg);
  const { warnings, ...macros } = macroGoal(energy.kcal, weightKg, split);
  return {
    bmr: energy.bmr,
    tdee: energy.tdee,
    kcal: energy.kcal,
    nutrients: { energy_kcal: energy.kcal, ...macros },
    warnings: [...energy.warnings, ...warnings],
  };
};
