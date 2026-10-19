import { z } from 'zod';
import {
  type DeclaredAmount,
  type DeclaredKey,
  type DeclaredNutrients,
  normaliseNutrients,
  parseAmount,
  type SourceFood,
  sourceFoodSchema,
} from '../../../domain/foods/source-food.ts';

export const cofidSheets = [
  '1.3 Proximates',
  '1.4 Inorganics',
  '1.5 Vitamins',
] as const;

export type CofidSheet = (typeof cofidSheets)[number];

export type CofidNutrient = {
  sheet: CofidSheet;
  column: string;
  declares: DeclaredKey;
};

export const cofidNutrients: readonly CofidNutrient[] = [
  { sheet: '1.3 Proximates', column: 'KCALS', declares: 'energy_kcal' },
  { sheet: '1.3 Proximates', column: 'KJ', declares: 'energy_kj' },

  { sheet: '1.3 Proximates', column: 'PROT', declares: 'protein' },
  { sheet: '1.3 Proximates', column: 'CHO', declares: 'carbohydrate' },
  { sheet: '1.3 Proximates', column: 'FAT', declares: 'fat' },
  { sheet: '1.3 Proximates', column: 'AOACFIB', declares: 'fibre' },
  { sheet: '1.3 Proximates', column: 'ENGFIB', declares: 'fibre' },
  { sheet: '1.3 Proximates', column: 'ALCO', declares: 'alcohol' },
  { sheet: '1.3 Proximates', column: 'WATER', declares: 'water' },

  { sheet: '1.3 Proximates', column: 'SATFOD', declares: 'saturated_fat' },
  {
    sheet: '1.3 Proximates',
    column: 'MONOFOD',
    declares: 'monounsaturated_fat',
  },
  {
    sheet: '1.3 Proximates',
    column: 'MONOFODc',
    declares: 'monounsaturated_fat',
  },
  {
    sheet: '1.3 Proximates',
    column: 'POLYFOD',
    declares: 'polyunsaturated_fat',
  },
  {
    sheet: '1.3 Proximates',
    column: 'POLYFODc',
    declares: 'polyunsaturated_fat',
  },
  { sheet: '1.3 Proximates', column: 'FODTRANS', declares: 'trans_fat' },
  { sheet: '1.3 Proximates', column: 'TOTn3PFOD', declares: 'omega_3' },
  { sheet: '1.3 Proximates', column: 'TOTn6PFOD', declares: 'omega_6' },
  { sheet: '1.3 Proximates', column: 'CHOL', declares: 'cholesterol' },

  { sheet: '1.3 Proximates', column: 'TOTSUG', declares: 'sugars' },
  { sheet: '1.3 Proximates', column: 'STAR', declares: 'starch' },

  { sheet: '1.4 Inorganics', column: 'NA', declares: 'sodium' },
  { sheet: '1.4 Inorganics', column: 'K', declares: 'potassium' },
  { sheet: '1.4 Inorganics', column: 'CL', declares: 'chloride' },
  { sheet: '1.4 Inorganics', column: 'CA', declares: 'calcium' },
  { sheet: '1.4 Inorganics', column: 'P', declares: 'phosphorus' },
  { sheet: '1.4 Inorganics', column: 'MG', declares: 'magnesium' },
  { sheet: '1.4 Inorganics', column: 'FE', declares: 'iron' },
  { sheet: '1.4 Inorganics', column: 'ZN', declares: 'zinc' },
  { sheet: '1.4 Inorganics', column: 'CU', declares: 'copper' },
  { sheet: '1.4 Inorganics', column: 'MN', declares: 'manganese' },
  { sheet: '1.4 Inorganics', column: 'SE', declares: 'selenium' },
  { sheet: '1.4 Inorganics', column: 'I', declares: 'iodine' },

  { sheet: '1.5 Vitamins', column: 'RETEQU', declares: 'vitamin_a' },
  { sheet: '1.5 Vitamins', column: 'VITD', declares: 'vitamin_d' },
  { sheet: '1.5 Vitamins', column: 'VITE', declares: 'vitamin_e' },
  { sheet: '1.5 Vitamins', column: 'VITK1', declares: 'vitamin_k' },
  { sheet: '1.5 Vitamins', column: 'VITC', declares: 'vitamin_c' },
  { sheet: '1.5 Vitamins', column: 'THIA', declares: 'thiamin' },
  { sheet: '1.5 Vitamins', column: 'RIBO', declares: 'riboflavin' },
  { sheet: '1.5 Vitamins', column: 'NIAC', declares: 'niacin' },
  { sheet: '1.5 Vitamins', column: 'VITB6', declares: 'vitamin_b6' },
  { sheet: '1.5 Vitamins', column: 'FOLT', declares: 'folate' },
  { sheet: '1.5 Vitamins', column: 'VITB12', declares: 'vitamin_b12' },
  { sheet: '1.5 Vitamins', column: 'BIOT', declares: 'biotin' },
  { sheet: '1.5 Vitamins', column: 'PANTO', declares: 'pantothenic_acid' },
];

export const ignoredCofidColumns: Readonly<
  Record<CofidSheet, readonly string[]>
> = {
  '1.3 Proximates': [
    'TOTNIT',
    'OLIGO',
    'GLUC',
    'GALACT',
    'FRUCT',
    'SUCR',
    'MALT',
    'LACT',
    'SATFAC',
    'TOTn6PFAC',
    'TOTn3PFAC',
    'MONOFACc',
    'MONOFAC',
    'POLYFACc',
    'POLYFAC',
    'SATFACx6',
    'SATFODx6',
    'TOTBRFAC',
    'TOTBRFOD',
    'FACTRANS',
  ],
  '1.4 Inorganics': [],
  '1.5 Vitamins': ['RET', 'CAREQU', 'TRYP60', 'NIACEQU'],
};

export type CofidValues = Readonly<Record<string, DeclaredAmount>>;

export type CofidFood = {
  code: string;
  name: string;
  values: CofidValues;
  lastModified: string | null;
};

export const declaredFromCofid = (values: CofidValues): DeclaredNutrients => {
  const declared: DeclaredNutrients = {};
  for (const { column, declares } of cofidNutrients) {
    if (declared[declares] === undefined && parseAmount(values[column])) {
      declared[declares] = values[column];
    }
  }
  return declared;
};

const declaresEnergy = (declared: DeclaredNutrients) =>
  declared.energy_kcal !== undefined || declared.energy_kj !== undefined;

const nutritionOf = (values: CofidValues) => {
  const declared = declaredFromCofid(values);
  const { nutrients, traces } = normaliseNutrients(declared);
  if (!declaresEnergy(declared)) {
    delete nutrients.energy_kcal;
  }
  return { nutrients, traces };
};

export type CofidMapping =
  | { success: true; food: SourceFood }
  | { success: false; reason: string };

export const sourceFoodFromCofid = (food: CofidFood): CofidMapping => {
  const candidate = {
    source: 'cofid',
    sourceId: food.code,
    barcode: null,
    name: food.name,
    brand: null,
    quantityLabel: null,
    ...nutritionOf(food.values),
    portions: [],
    lastModified: food.lastModified,
  };
  const parsed = sourceFoodSchema.safeParse(candidate);
  return parsed.success
    ? { success: true, food: parsed.data }
    : {
        success: false,
        reason: `${food.code}: ${z.prettifyError(parsed.error)}`,
      };
};
