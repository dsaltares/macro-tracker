import { z } from 'zod';
import { type NutrientKey, nutrientKeys } from '../nutrition/nutrients.ts';
import {
  kcal,
  kcalFromMacros,
  type NutrientVector,
  per100gFrom,
  sodium,
} from '../nutrition/vector.ts';
import { isValidBarcode } from './barcode.ts';

export const referenceSources = ['off', 'ciqual', 'cofid', 'usda'] as const;

export type ReferenceSource = (typeof referenceSources)[number];

const nutrientKeySchema = z.enum(nutrientKeys);

export const nutrientVectorSchema = z.partialRecord(
  nutrientKeySchema,
  z.number().nonnegative(),
);

export const sourcePortionSchema = z.strictObject({
  label: z.string().min(1),
  grams: z.number().positive(),
});

export type SourcePortion = z.infer<typeof sourcePortionSchema>;

export const sourceFoodSchema = z
  .strictObject({
    source: z.enum(referenceSources),
    sourceId: z.string().min(1),
    barcode: z
      .string()
      .refine(isValidBarcode, 'Not a valid EAN-8 or EAN-13')
      .nullable(),
    name: z.string().min(1),
    brand: z.string().min(1).nullable(),
    quantityLabel: z.string().min(1).nullable(),
    nutrients: nutrientVectorSchema,
    traces: z.array(nutrientKeySchema),
    portions: z.array(sourcePortionSchema),
    lastModified: z.iso.datetime().nullable(),
  })
  .refine((food) => food.traces.every((key) => food.nutrients[key] === 0), {
    message: 'A trace is a nutrient stored as zero',
    path: ['traces'],
  });

export type SourceFood = z.infer<typeof sourceFoodSchema>;

const derivedFrom = {
  energy_kj: { into: 'energy_kcal', convert: kcal },
  salt: { into: 'sodium', convert: sodium },
} as const satisfies Record<
  string,
  { into: NutrientKey; convert: (amount: number) => number }
>;

type DerivingKey = keyof typeof derivedFrom;

export type DeclaredKey = NutrientKey | DerivingKey;

export type DeclaredAmount = number | string | null | undefined;

export type DeclaredNutrients = Partial<Record<DeclaredKey, DeclaredAmount>>;

export type Amount = { amount: number; trace: boolean };

const traceWords = new Set(['traces', 'trace', 'tr']);
const belowALimit = /^[<≤]/;

const knownAmount = (amount: number): Amount | undefined =>
  Number.isFinite(amount) && amount >= 0 ? { amount, trace: false } : undefined;

export const parseAmount = (declared: DeclaredAmount): Amount | undefined => {
  if (typeof declared === 'number') {
    return knownAmount(declared);
  }
  const text = declared?.trim().toLowerCase() ?? '';
  if (traceWords.has(text) || belowALimit.test(text)) {
    return { amount: 0, trace: true };
  }
  return text === '' ? undefined : knownAmount(Number(text.replace(',', '.')));
};

export type NutrientBasis = { per: '100g' } | { per: 'serving'; grams: number };

export type NormalisedNutrients = {
  nutrients: NutrientVector;
  traces: NutrientKey[];
};

const isDeriving = (key: DeclaredKey): key is DerivingKey =>
  Object.hasOwn(derivedFrom, key);

export const normaliseNutrients = (
  declared: DeclaredNutrients,
  basis: NutrientBasis = { per: '100g' },
): NormalisedNutrients => {
  const amounts = new Map<NutrientKey, Amount>();
  const deriving: [DerivingKey, Amount][] = [];
  for (const [key, value] of Object.entries(declared) as [
    DeclaredKey,
    DeclaredAmount,
  ][]) {
    const amount = parseAmount(value);
    if (amount === undefined) {
      continue;
    }
    if (isDeriving(key)) {
      deriving.push([key, amount]);
    } else {
      amounts.set(key, amount);
    }
  }

  for (const [key, { amount, trace }] of deriving) {
    const { into, convert } = derivedFrom[key];
    if (!amounts.has(into)) {
      amounts.set(into, { amount: convert(amount), trace });
    }
  }

  const nutrients: NutrientVector = Object.fromEntries(
    [...amounts].map(([key, { amount }]) => [key, amount]),
  );
  if (nutrients.energy_kcal === undefined) {
    const fromMacros = kcalFromMacros(nutrients);
    if (fromMacros !== undefined) {
      nutrients.energy_kcal = fromMacros;
    }
  }

  return {
    nutrients:
      basis.per === 'serving' ? per100gFrom(nutrients, basis.grams) : nutrients,
    traces: [...amounts].filter(([, { trace }]) => trace).map(([key]) => key),
  };
};
