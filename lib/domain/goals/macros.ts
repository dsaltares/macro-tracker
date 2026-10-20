import { kcalPerGram } from '../nutrition/vector.ts';

export const fibreGramsPer1000Kcal = 14;

export type MacroSplit = {
  proteinGPerKg: number;
  fatEnergyShare: number;
};

export type MacroWarning = 'carbohydrate_floored';

export type MacroGoal = {
  protein: number;
  fat: number;
  carbohydrate: number;
  fibre: number;
  warnings: MacroWarning[];
};

export const macroGoal = (
  kcal: number,
  weightKg: number,
  { proteinGPerKg, fatEnergyShare }: MacroSplit,
): MacroGoal => {
  const protein = proteinGPerKg * weightKg;
  const fat = (fatEnergyShare * kcal) / kcalPerGram.fat;
  const remainingKcal =
    kcal - protein * kcalPerGram.protein - fat * kcalPerGram.fat;
  return {
    protein,
    fat,
    carbohydrate: Math.max(0, remainingKcal / kcalPerGram.carbohydrate),
    fibre: (fibreGramsPer1000Kcal * kcal) / 1000,
    warnings: remainingKcal < 0 ? ['carbohydrate_floored'] : [],
  };
};
