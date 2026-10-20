import {
  convertAmount,
  type LabelReading,
  type PrintedNutrient,
} from '../../domain/foods/label-reading.ts';
import { parseAmount } from '../../domain/foods/source-food.ts';

export const euMandatoryNutrients = new Set<PrintedNutrient['nutrient']>([
  'energy_kj',
  'energy_kcal',
  'fat',
  'saturated_fat',
  'carbohydrate',
  'sugars',
  'protein',
  'salt',
  'sodium',
]);

export type Tally = { correct: number; total: number };

export type ReadingScore = {
  eu: Tally;
  other: Tally;
  misses: string[];
  extras: string[];
};

type Column = 'per100g' | 'perServing';

const columns: Column[] = ['per100g', 'perServing'];

const relativeTolerance = 1e-9;

const sameAmount = (expected: PrintedNutrient, read: PrintedNutrient) => {
  const want = parseAmount(expected.printed);
  const got = parseAmount(read.printed);
  if (want === undefined || got === undefined || want.trace !== got.trace) {
    return false;
  }
  const converted = convertAmount(got.amount, read.unit, expected.unit);
  return (
    Math.abs(converted - want.amount) <=
    relativeTolerance * Math.max(1, want.amount)
  );
};

const sameText = (expected: string, read: string | undefined) =>
  read !== undefined &&
  expected.replace(/\s+/g, '').toLowerCase() ===
    read.replace(/\s+/g, '').toLowerCase();

const textFields = ['productName', 'brand', 'netQuantity'] as const;

export const scoreReading = (
  expected: LabelReading,
  reading: LabelReading | null,
): ReadingScore => {
  const score: ReadingScore = {
    eu: { correct: 0, total: 0 },
    other: { correct: 0, total: 0 },
    misses: [],
    extras: [],
  };
  const record = (tally: Tally, field: string, correct: boolean) => {
    tally.total += 1;
    if (correct) {
      tally.correct += 1;
    } else {
      score.misses.push(field);
    }
  };
  for (const column of columns) {
    for (const entry of expected[column]) {
      const read = reading?.[column].find(
        ({ nutrient }) => nutrient === entry.nutrient,
      );
      const tally =
        column === 'per100g' && euMandatoryNutrients.has(entry.nutrient)
          ? score.eu
          : score.other;
      record(
        tally,
        `${column}.${entry.nutrient}`,
        read !== undefined && sameAmount(entry, read),
      );
    }
    for (const { nutrient } of reading?.[column] ?? []) {
      if (!expected[column].some((entry) => entry.nutrient === nutrient)) {
        score.extras.push(`${column}.${nutrient}`);
      }
    }
  }
  for (const field of textFields) {
    const value = expected[field]?.value;
    if (value !== undefined) {
      record(score.other, field, sameText(value, reading?.[field]?.value));
    }
  }
  if (expected.servingSize !== null) {
    const { amount, unit } = expected.servingSize;
    record(
      score.other,
      'servingSize',
      reading?.servingSize?.amount === amount &&
        reading.servingSize.unit === unit,
    );
  }
  return score;
};

export const addTallies = (tallies: readonly Tally[]): Tally =>
  tallies.reduce(
    (sum, { correct, total }) => ({
      correct: sum.correct + correct,
      total: sum.total + total,
    }),
    { correct: 0, total: 0 },
  );

export const accuracy = ({ correct, total }: Tally) =>
  total === 0 ? 1 : correct / total;
