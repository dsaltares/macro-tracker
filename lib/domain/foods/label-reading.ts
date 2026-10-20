import { z } from 'zod';
import {
  type NutrientKey,
  nutrientByKey,
  nutrientKeys,
} from '../nutrition/nutrients.ts';
import { kcalPerGram, kJ, type NutrientVector } from '../nutrition/vector.ts';
import {
  gramsPerMillilitreWithoutDensity,
  isStandardLabel,
} from './portions.ts';
import {
  canonicalKeyOf,
  type DeclaredKey,
  type DeclaredNutrients,
  derivingKeys,
  type NutrientBasis,
  normaliseNutrients,
  parseAmount,
} from './source-food.ts';
import { roundedVector, type UserFoodPortion } from './user-food.ts';

export const printedUnits = ['kJ', 'kcal', 'g', 'mg', 'µg'] as const;

export type PrintedUnit = (typeof printedUnits)[number];

export const servingUnits = ['g', 'ml'] as const;

export const labelNutrientKeys = [
  ...nutrientKeys,
  ...derivingKeys,
] as const satisfies readonly DeclaredKey[];

const unitScales = {
  kcal: { dimension: 'energy', perBase: 1 },
  kJ: { dimension: 'energy', perBase: kJ(1) },
  g: { dimension: 'mass', perBase: 1 },
  mg: { dimension: 'mass', perBase: 1_000 },
  µg: { dimension: 'mass', perBase: 1_000_000 },
} as const satisfies Record<
  PrintedUnit,
  { dimension: 'energy' | 'mass'; perBase: number }
>;

const declaredUnits = {
  energy_kj: 'kJ',
  salt: 'g',
} as const satisfies Record<(typeof derivingKeys)[number], PrintedUnit>;

const declaredUnitOf = (key: DeclaredKey): PrintedUnit =>
  Object.hasOwn(declaredUnits, key)
    ? declaredUnits[key as keyof typeof declaredUnits]
    : nutrientByKey[key as NutrientKey].unit;

export const fitsNutrient = (key: DeclaredKey, unit: PrintedUnit) =>
  unitScales[declaredUnitOf(key)].dimension === unitScales[unit].dimension;

export const convertAmount = (
  amount: number,
  from: PrintedUnit,
  to: PrintedUnit,
) => (amount / unitScales[from].perBase) * unitScales[to].perBase;

const confidenceSchema = z
  .number()
  .min(0)
  .max(1)
  .describe('How sure you are of this reading, from 0 to 1');

const readTextSchema = z
  .strictObject({
    value: z.string().trim().min(1),
    confidence: confidenceSchema,
  })
  .nullable();

export const printedNutrientSchema = z
  .strictObject({
    nutrient: z.enum(labelNutrientKeys),
    printed: z
      .string()
      .trim()
      .min(1)
      .describe(
        'The amount exactly as printed, without the unit: "12,5", "<0.5", "traces"',
      ),
    unit: z.enum(printedUnits),
    confidence: confidenceSchema,
  })
  .refine(({ nutrient, unit }) => fitsNutrient(nutrient, unit), {
    message: 'The unit does not measure this nutrient',
    path: ['unit'],
  });

export type PrintedNutrient = z.infer<typeof printedNutrientSchema>;

export const servingSizeSchema = z
  .strictObject({
    label: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe('The serving as the label names it: "1 biscuit", "1/2 pack"'),
    amount: z.number().positive(),
    unit: z.enum(servingUnits),
    confidence: confidenceSchema,
  })
  .nullable();

export const labelReadingSchema = z
  .strictObject({
    productName: readTextSchema,
    brand: readTextSchema,
    netQuantity: readTextSchema.describe(
      'The net quantity of the pack as printed: "400 g", "6 x 33 cl"',
    ),
    servingSize: servingSizeSchema,
    per100g: z
      .array(printedNutrientSchema)
      .describe('The column per 100 g or per 100 ml, empty when there is none'),
    perServing: z
      .array(printedNutrientSchema)
      .describe('The column per serving, empty when there is none'),
    notes: z
      .array(z.string().trim().min(1))
      .describe('Anything on the label you could not read, or had to guess'),
  })
  .refine(
    ({ per100g, perServing }) => per100g.length > 0 || perServing.length > 0,
    {
      message: 'A reading needs values per 100 g or per serving',
      path: ['per100g'],
    },
  )
  .refine(
    ({ per100g, perServing, servingSize }) =>
      per100g.length > 0 || perServing.length === 0 || servingSize !== null,
    {
      message: 'Values only per serving need the serving size',
      path: ['servingSize'],
    },
  );

export type LabelReading = z.infer<typeof labelReadingSchema>;

export type LabelConfidence = {
  name: number | null;
  brand: number | null;
  quantityLabel: number | null;
  portions: number | null;
  nutrients: Partial<Record<NutrientKey, number>>;
};

export type LabelFood = {
  name: string | null;
  brand: string | null;
  quantityLabel: string | null;
  nutrients: NutrientVector;
  portions: UserFoodPortion[];
  confidence: LabelConfidence;
  notes: string[];
};

const energyMacros = Object.keys(kcalPerGram) as NutrientKey[];

const firstOfEach = (printed: readonly PrintedNutrient[]) =>
  printed.filter(
    ({ nutrient }, index) =>
      printed.findIndex((entry) => entry.nutrient === nutrient) === index,
  );

const declaredAmount = ({ nutrient, printed, unit }: PrintedNutrient) => {
  const parsed = parseAmount(printed);
  if (parsed === undefined) {
    return undefined;
  }
  return parsed.trace
    ? printed
    : convertAmount(parsed.amount, unit, declaredUnitOf(nutrient));
};

const declaredOf = (printed: readonly PrintedNutrient[]): DeclaredNutrients =>
  Object.fromEntries(
    printed.map((entry) => [entry.nutrient, declaredAmount(entry)]),
  );

const isDerived = ({ nutrient }: PrintedNutrient) =>
  canonicalKeyOf(nutrient) !== nutrient;

const nutrientConfidence = (
  printed: readonly PrintedNutrient[],
  nutrients: NutrientVector,
) => {
  const readable = printed.filter(
    (entry) => parseAmount(entry.printed) !== undefined,
  );
  const confidence: Partial<Record<NutrientKey, number>> = {};
  for (const entry of [
    ...readable.filter((entry) => !isDerived(entry)),
    ...readable.filter(isDerived),
  ]) {
    confidence[canonicalKeyOf(entry.nutrient)] ??= entry.confidence;
  }
  if (
    confidence.energy_kcal === undefined &&
    nutrients.energy_kcal !== undefined
  ) {
    confidence.energy_kcal = Math.min(
      ...energyMacros.flatMap((key) => confidence[key] ?? []),
    );
  }
  return confidence;
};

const servingGrams = ({ amount, unit }: { amount: number; unit: string }) =>
  unit === 'ml' ? amount * gramsPerMillilitreWithoutDensity : amount;

const noServing = { portions: [], confidence: null };

const servingOf = (
  servingSize: LabelReading['servingSize'],
): { portions: UserFoodPortion[]; confidence: number | null } => {
  if (servingSize === null) {
    return noServing;
  }
  const label =
    servingSize.label ?? `${servingSize.amount} ${servingSize.unit}`;
  return isStandardLabel(label)
    ? noServing
    : {
        portions: [{ label, grams: servingGrams(servingSize) }],
        confidence: servingSize.confidence,
      };
};

export const labelReadingToFood = (reading: LabelReading): LabelFood => {
  const { productName, brand, netQuantity, servingSize } = reading;
  const perServingOnly = reading.per100g.length === 0 && servingSize !== null;
  const printed = firstOfEach(
    perServingOnly ? reading.perServing : reading.per100g,
  );
  const basis: NutrientBasis = perServingOnly
    ? { per: 'serving', grams: servingGrams(servingSize) }
    : { per: '100g' };
  const { nutrients } = normaliseNutrients(declaredOf(printed), basis);
  const serving = servingOf(servingSize);
  return {
    name: productName?.value ?? null,
    brand: brand?.value ?? null,
    quantityLabel: netQuantity?.value ?? null,
    nutrients: roundedVector(nutrients),
    portions: serving.portions,
    confidence: {
      name: productName?.confidence ?? null,
      brand: brand?.confidence ?? null,
      quantityLabel: netQuantity?.confidence ?? null,
      portions: serving.confidence,
      nutrients: nutrientConfidence(printed, nutrients),
    },
    notes: reading.notes,
  };
};
