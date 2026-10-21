import {
  nameMatchesEveryTerm,
  searchTerms,
} from '../../domain/foods/search.ts';
import type { Source } from '../../domain/foods/sources.ts';
import type { NutrientKey } from '../../domain/nutrition/nutrients.ts';
import {
  type NutrientVector,
  withEnergy,
} from '../../domain/nutrition/vector.ts';

export type CanonicalNutrients = Partial<Record<NutrientKey, number | null>>;

export type Candidate = {
  id: string;
  source: Source;
  name: string;
  brand: string | null;
  nutrients: CanonicalNutrients;
};

export const vectorOf = (nutrients: CanonicalNutrients): NutrientVector =>
  Object.fromEntries(
    Object.entries(nutrients).filter(
      ([, amount]) => typeof amount === 'number',
    ),
  ) as NutrientVector;

type Tolerance = { absolute: number; relative: number };

const gramTolerance: Tolerance = { absolute: 1, relative: 0.05 };

const macroTolerances: Partial<Record<NutrientKey, Tolerance>> = {
  energy_kcal: { absolute: 5, relative: 0.03 },
  protein: gramTolerance,
  carbohydrate: gramTolerance,
  fat: gramTolerance,
};

const labelTolerances: Partial<Record<NutrientKey, Tolerance>> = {
  sugars: gramTolerance,
  fibre: gramTolerance,
  saturated_fat: gramTolerance,
};

const entriesOf = (tolerances: Partial<Record<NutrientKey, Tolerance>>) =>
  Object.entries(tolerances) as [NutrientKey, Tolerance][];

const allowance = ({ absolute, relative }: Tolerance, expected: number) =>
  Math.max(absolute, relative * Math.abs(expected));

const misses = (expected: NutrientVector, actual: NutrientVector) => {
  const wanted = withEnergy(expected);
  const found = withEnergy(actual);
  const miss = (key: NutrientKey, tolerance: Tolerance) =>
    Math.abs((found[key] ?? 0) - (wanted[key] ?? 0)) /
    allowance(tolerance, wanted[key] ?? 0);
  return [
    ...entriesOf(macroTolerances).map(([key, tolerance]) =>
      miss(key, tolerance),
    ),
    ...entriesOf(labelTolerances)
      .filter(([key]) => wanted[key] !== undefined && found[key] !== undefined)
      .map(([key, tolerance]) => miss(key, tolerance)),
  ];
};

export const macrosAgree = (expected: NutrientVector, actual: NutrientVector) =>
  misses(expected, actual).every((miss) => miss <= 1);

export const macroDistance = (
  expected: NutrientVector,
  actual: NutrientVector,
) => misses(expected, actual).reduce((total, miss) => total + miss, 0);

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('en') === b.trim().toLocaleLowerCase('en');

export const ownCopyAmong = (
  target: { name: string; nutrients: NutrientVector },
  candidates: readonly Candidate[],
) =>
  candidates.find(
    (candidate) =>
      candidate.source === 'user' &&
      sameName(candidate.name, target.name) &&
      macrosAgree(target.nutrients, vectorOf(candidate.nutrients)),
  ) ?? null;

const namesEveryWord = (candidate: Candidate, words: string) =>
  nameMatchesEveryTerm(`${candidate.name} ${candidate.brand ?? ''}`, words);

export const closestAgreeing = (
  { words, nutrients }: { words: string; nutrients: NutrientVector },
  candidates: readonly Candidate[],
) => {
  let best: { candidate: Candidate; distance: number } | null = null;
  for (const candidate of candidates) {
    const actual = vectorOf(candidate.nutrients);
    if (!namesEveryWord(candidate, words) || !macrosAgree(nutrients, actual)) {
      continue;
    }
    const distance = macroDistance(nutrients, actual);
    if (best === null || distance < best.distance) {
      best = { candidate, distance };
    }
  }
  return best?.candidate ?? null;
};

export const searchQueriesFor = (queries: readonly string[]) => {
  const byTerms = new Map<string, string>();
  for (const query of queries) {
    const terms = searchTerms(query).join(' ');
    if (terms !== '' && !byTerms.has(terms.toLocaleLowerCase('en'))) {
      byTerms.set(terms.toLocaleLowerCase('en'), terms);
    }
  }
  return [...byTerms.values()];
};
