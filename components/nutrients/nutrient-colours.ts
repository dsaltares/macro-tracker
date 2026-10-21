import type { Progress } from '@/lib/domain/goals/progress';
import type { NutrientKey } from '@/lib/domain/nutrition/nutrients';

export const macroColours = {
  protein: { fill: 'bg-protein', stroke: 'stroke-protein' },
  carbohydrate: { fill: 'bg-carbohydrate', stroke: 'stroke-carbohydrate' },
  fat: { fill: 'bg-fat', stroke: 'stroke-fat' },
} as const;

export const energyColour = { fill: 'bg-energy', stroke: 'stroke-energy' };

export type MacroKey = keyof typeof macroColours;

const isMacro = (key: NutrientKey): key is MacroKey =>
  Object.hasOwn(macroColours, key);

export const hasOwnColour = (key: NutrientKey) =>
  key === 'energy_kcal' || isMacro(key);

export const isOver = (progress: Progress | null | undefined) =>
  progress === 'over';

export const overStroke = 'stroke-destructive';

export const overText = 'text-destructive';

const colourOf = (key: NutrientKey) =>
  isMacro(key) ? macroColours[key] : energyColour;

export const nutrientFill = (key: NutrientKey, progress: Progress) =>
  isOver(progress) ? 'bg-destructive' : colourOf(key).fill;

export const nutrientStroke = (key: NutrientKey, progress: Progress) =>
  isOver(progress) ? overStroke : colourOf(key).stroke;
