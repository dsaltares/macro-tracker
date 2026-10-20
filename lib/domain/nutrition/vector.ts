import type { NutrientKey } from './nutrients.ts';

export type NutrientVector = Partial<Record<NutrientKey, number>>;

export const kcalPerGram = {
  protein: 4,
  carbohydrate: 4,
  fat: 9,
  alcohol: 7,
} as const satisfies NutrientVector;

const energyMacros = Object.keys(kcalPerGram) as (keyof typeof kcalPerGram)[];

const kJPerKcal = 4.184;
const saltPerSodium = 2.5;
const mgPerGram = 1000;
const gramsPerReference = 100;

const amounts = (vector: NutrientVector) =>
  Object.entries(vector) as [NutrientKey, number][];

export const scale = (vector: NutrientVector, factor: number): NutrientVector =>
  Object.fromEntries(
    amounts(vector).map(([key, amount]) => [key, amount * factor]),
  );

export const sum = (vectors: readonly NutrientVector[]): NutrientVector => {
  const total: NutrientVector = {};
  for (const vector of vectors) {
    for (const [key, amount] of amounts(vector)) {
      total[key] = (total[key] ?? 0) + amount;
    }
  }
  return total;
};

export const forGrams = (per100g: NutrientVector, grams: number) =>
  scale(per100g, grams / gramsPerReference);

export const per100gFrom = (vector: NutrientVector, grams: number) =>
  scale(vector, gramsPerReference / grams);

export const kcalFromMacros = (vector: NutrientVector): number | undefined => {
  const contributions = energyMacros.flatMap((key) => {
    const grams = vector[key];
    return grams === undefined ? [] : [grams * kcalPerGram[key]];
  });
  return contributions.length === 0
    ? undefined
    : contributions.reduce((kcal, contribution) => kcal + contribution, 0);
};

export const withEnergy = (vector: NutrientVector): NutrientVector => {
  if (vector.energy_kcal !== undefined) {
    return vector;
  }
  const fromMacros = kcalFromMacros(vector);
  return fromMacros === undefined
    ? vector
    : { ...vector, energy_kcal: fromMacros };
};

export const kJ = (kcal: number) => kcal * kJPerKcal;

export const kcal = (kJ: number) => kJ / kJPerKcal;

export const salt = (sodiumMg: number) =>
  (sodiumMg * saltPerSodium) / mgPerGram;

export const sodium = (saltG: number) => (saltG / saltPerSodium) * mgPerGram;
