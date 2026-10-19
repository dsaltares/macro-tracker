import { z } from 'zod';
import { normaliseBarcode } from '../../../domain/foods/barcode.ts';
import {
  type DeclaredAmount,
  type DeclaredKey,
  type DeclaredNutrients,
  normaliseNutrients,
  parseAmount,
  type SourceFood,
  sourceFoodSchema,
} from '../../../domain/foods/source-food.ts';

const asDeclared = 1;
const toGrams = 1;
const toMilligrams = 1_000;
const toMicrograms = 1_000_000;
const alcoholGramsPerPercentVolume = 0.789;

export type OffNutriment = {
  off: string;
  declares: DeclaredKey;
  factor: number;
};

export const offNutriments: readonly OffNutriment[] = [
  { off: 'energy-kcal', declares: 'energy_kcal', factor: asDeclared },
  { off: 'energy-kj', declares: 'energy_kj', factor: asDeclared },
  { off: 'energy', declares: 'energy_kj', factor: asDeclared },

  { off: 'proteins', declares: 'protein', factor: toGrams },
  { off: 'carbohydrates', declares: 'carbohydrate', factor: toGrams },
  { off: 'fat', declares: 'fat', factor: toGrams },
  { off: 'fiber', declares: 'fibre', factor: toGrams },
  {
    off: 'alcohol',
    declares: 'alcohol',
    factor: alcoholGramsPerPercentVolume,
  },
  { off: 'water', declares: 'water', factor: toGrams },

  { off: 'saturated-fat', declares: 'saturated_fat', factor: toGrams },
  {
    off: 'monounsaturated-fat',
    declares: 'monounsaturated_fat',
    factor: toGrams,
  },
  {
    off: 'polyunsaturated-fat',
    declares: 'polyunsaturated_fat',
    factor: toGrams,
  },
  { off: 'trans-fat', declares: 'trans_fat', factor: toGrams },
  { off: 'omega-3-fat', declares: 'omega_3', factor: toGrams },
  { off: 'omega-6-fat', declares: 'omega_6', factor: toGrams },
  { off: 'cholesterol', declares: 'cholesterol', factor: toMilligrams },

  { off: 'sugars', declares: 'sugars', factor: toGrams },
  { off: 'added-sugars', declares: 'added_sugars', factor: toGrams },
  { off: 'starch', declares: 'starch', factor: toGrams },
  { off: 'polyols', declares: 'polyols', factor: toGrams },

  { off: 'sodium', declares: 'sodium', factor: toMilligrams },
  { off: 'salt', declares: 'salt', factor: asDeclared },
  { off: 'potassium', declares: 'potassium', factor: toMilligrams },
  { off: 'chloride', declares: 'chloride', factor: toMilligrams },
  { off: 'calcium', declares: 'calcium', factor: toMilligrams },
  { off: 'phosphorus', declares: 'phosphorus', factor: toMilligrams },
  { off: 'magnesium', declares: 'magnesium', factor: toMilligrams },
  { off: 'iron', declares: 'iron', factor: toMilligrams },
  { off: 'zinc', declares: 'zinc', factor: toMilligrams },
  { off: 'copper', declares: 'copper', factor: toMilligrams },
  { off: 'manganese', declares: 'manganese', factor: toMilligrams },
  { off: 'fluoride', declares: 'fluoride', factor: toMilligrams },
  { off: 'selenium', declares: 'selenium', factor: toMicrograms },
  { off: 'chromium', declares: 'chromium', factor: toMicrograms },
  { off: 'molybdenum', declares: 'molybdenum', factor: toMicrograms },
  { off: 'iodine', declares: 'iodine', factor: toMicrograms },

  { off: 'vitamin-a', declares: 'vitamin_a', factor: toMicrograms },
  { off: 'vitamin-d', declares: 'vitamin_d', factor: toMicrograms },
  { off: 'vitamin-e', declares: 'vitamin_e', factor: toMilligrams },
  { off: 'vitamin-k', declares: 'vitamin_k', factor: toMicrograms },
  { off: 'phylloquinone', declares: 'vitamin_k', factor: toMicrograms },
  { off: 'vitamin-c', declares: 'vitamin_c', factor: toMilligrams },
  { off: 'vitamin-b1', declares: 'thiamin', factor: toMilligrams },
  { off: 'vitamin-b2', declares: 'riboflavin', factor: toMilligrams },
  { off: 'vitamin-pp', declares: 'niacin', factor: toMilligrams },
  { off: 'vitamin-b6', declares: 'vitamin_b6', factor: toMilligrams },
  { off: 'vitamin-b9', declares: 'folate', factor: toMicrograms },
  { off: 'folates', declares: 'folate', factor: toMicrograms },
  { off: 'vitamin-b12', declares: 'vitamin_b12', factor: toMicrograms },
  { off: 'biotin', declares: 'biotin', factor: toMicrograms },
  {
    off: 'pantothenic-acid',
    declares: 'pantothenic_acid',
    factor: toMilligrams,
  },
  { off: 'choline', declares: 'choline', factor: toMilligrams },

  { off: 'caffeine', declares: 'caffeine', factor: toMilligrams },
];

export const ignoredOffNutriments: readonly string[] = [
  'energy-from-fat',
  'butyric-acid',
  'caproic-acid',
  'caprylic-acid',
  'capric-acid',
  'lauric-acid',
  'myristic-acid',
  'palmitic-acid',
  'stearic-acid',
  'arachidic-acid',
  'behenic-acid',
  'lignoceric-acid',
  'cerotic-acid',
  'montanic-acid',
  'melissic-acid',
  'unsaturated-fat',
  'omega-9-fat',
  'alpha-linolenic-acid',
  'eicosapentaenoic-acid',
  'docosahexaenoic-acid',
  'linoleic-acid',
  'arachidonic-acid',
  'gamma-linolenic-acid',
  'dihomo-gamma-linolenic-acid',
  'oleic-acid',
  'elaidic-acid',
  'gondoic-acid',
  'mead-acid',
  'erucic-acid',
  'nervonic-acid',
  'sucrose',
  'glucose',
  'fructose',
  'galactose',
  'lactose',
  'maltose',
  'maltodextrins',
  'psicose',
  'erythritol',
  'isomalt',
  'maltitol',
  'sorbitol',
  'soluble-fiber',
  'polydextrose',
  'insoluble-fiber',
  'casein',
  'serum-proteins',
  'nucleotides',
  'added-salt',
  'beta-carotene',
  'vitamin-d2',
  'vitamin-d3',
  'silica',
  'bicarbonate',
  'taurine',
  'methylsulfonylmethane',
  'hydroxymethylbutyrate',
  'ph',
  'fruits-vegetables-legumes',
  'fruits-vegetables-legumes-estimate-from-ingredients',
  'fruits-vegetables-nuts',
  'fruits-vegetables-nuts-dried',
  'fruits-vegetables-nuts-estimate-from-ingredients',
  'collagen-meat-protein-ratio',
  'cocoa',
  'chlorophyl',
  'carbon-footprint',
  'glycemic-index',
  'water-hardness',
  'beta-glucan',
  'inositol',
  'carnitine',
  'sulphate',
  'nitrate',
  'acidity',
  'carbohydrates-total',
  'dry-residue',
  'nova-group',
];

export type OffBasis = '100g' | 'serving';

const belowALimit = new Set(['<', '≤']);
const trace = 'traces';

const declaredValue = (value: unknown): DeclaredAmount =>
  typeof value === 'number' || typeof value === 'string' ? value : undefined;

export const declaredFromOff = (
  nutriments: Record<string, unknown>,
  basis: OffBasis,
): DeclaredNutrients => {
  const declared: DeclaredNutrients = {};
  for (const { off, declares, factor } of offNutriments) {
    if (declared[declares] !== undefined) {
      continue;
    }
    const parsed = parseAmount(declaredValue(nutriments[`${off}_${basis}`]));
    if (parsed === undefined) {
      continue;
    }
    const modifier = nutriments[`${off}_modifier`];
    declared[declares] =
      parsed.trace || belowALimit.has(String(modifier))
        ? trace
        : parsed.amount * factor;
  }
  return declared;
};

const declaredEnergy: readonly DeclaredKey[] = ['energy_kcal', 'energy_kj'];
const declaredMacros: readonly DeclaredKey[] = [
  'protein',
  'fat',
  'carbohydrate',
];

export const declaresNutritionFacts = (nutriments: Record<string, unknown>) => {
  const declared = declaredFromOff(nutriments, '100g');
  const declares = (key: DeclaredKey) => declared[key] !== undefined;
  return declaredEnergy.some(declares) && declaredMacros.some(declares);
};

const offNumber = z.union([z.number(), z.string()]).nullish();
const offText = z.string().nullish();

export const offProductSchema = z.object({
  code: z.string(),
  product_name: offText,
  brands: offText,
  quantity: offText,
  serving_size: offText,
  serving_quantity: offNumber,
  last_modified_t: offNumber,
  nutriments: z.record(z.string(), z.unknown()).default({}),
});

export type OffProduct = z.input<typeof offProductSchema>;

export type OffMapping =
  | { success: true; food: SourceFood }
  | { success: false; reason: string };

const textOrNull = (text: string | null | undefined) => text?.trim() || null;

const firstBrand = (brands: string | null | undefined) =>
  textOrNull(brands?.split(',')[0]);

const positiveAmount = (value: DeclaredAmount) => {
  const parsed = parseAmount(value);
  return parsed && parsed.amount > 0 ? parsed.amount : undefined;
};

const millisecondsPerSecond = 1000;

const isoFromUnixSeconds = (seconds: DeclaredAmount) => {
  const parsed = positiveAmount(seconds);
  return parsed === undefined
    ? null
    : new Date(parsed * millisecondsPerSecond).toISOString();
};

const nutritionOf = (
  nutriments: Record<string, unknown>,
  servingGrams: number | undefined,
) => {
  const per100g = declaredFromOff(nutriments, '100g');
  if (Object.keys(per100g).length > 0 || servingGrams === undefined) {
    return normaliseNutrients(per100g);
  }
  return normaliseNutrients(declaredFromOff(nutriments, 'serving'), {
    per: 'serving',
    grams: servingGrams,
  });
};

export const sourceFoodFromOff = (product: OffProduct): OffMapping => {
  const code = product.code.trim();
  const barcode = normaliseBarcode(code);
  if (barcode === null) {
    return {
      success: false,
      reason: `${code}: not a valid EAN-8, EAN-13 or UPC-A`,
    };
  }
  const servingGrams = positiveAmount(product.serving_quantity);
  const servingLabel = textOrNull(product.serving_size);
  const candidate = {
    source: 'off',
    sourceId: code,
    barcode,
    name: textOrNull(product.product_name),
    originalName: null,
    brand: firstBrand(product.brands),
    quantityLabel: textOrNull(product.quantity),
    ...nutritionOf(product.nutriments ?? {}, servingGrams),
    portions:
      servingGrams === undefined
        ? []
        : [{ label: servingLabel ?? `${servingGrams} g`, grams: servingGrams }],
    lastModified: isoFromUnixSeconds(product.last_modified_t),
  };
  const parsed = sourceFoodSchema.safeParse(candidate);
  return parsed.success
    ? { success: true, food: parsed.data }
    : {
        success: false,
        reason: `${code}: ${z.prettifyError(parsed.error)}`,
      };
};
