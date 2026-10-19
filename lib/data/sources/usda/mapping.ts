import { z } from 'zod';
import {
  type DeclaredKey,
  type DeclaredNutrients,
  normaliseNutrients,
  type SourceFood,
  type SourcePortion,
  sourceFoodSchema,
} from '../../../domain/foods/source-food.ts';

export const usdaDatasets = ['foundation', 'sr-legacy', 'fndds'] as const;

export type UsdaDataset = (typeof usdaDatasets)[number];

export type UsdaUnit = 'KCAL' | 'kJ' | 'G' | 'MG' | 'UG';

const asDeclared = 1;
const microgramsToMilligrams = 1 / 1_000;

export type UsdaNutrient = {
  number: string;
  unit: UsdaUnit;
  declares: DeclaredKey;
  factor: number;
};

export const usdaNutrients: readonly UsdaNutrient[] = [
  { number: '208', unit: 'KCAL', declares: 'energy_kcal', factor: asDeclared },
  { number: '958', unit: 'KCAL', declares: 'energy_kcal', factor: asDeclared },
  { number: '957', unit: 'KCAL', declares: 'energy_kcal', factor: asDeclared },
  { number: '268', unit: 'kJ', declares: 'energy_kj', factor: asDeclared },

  { number: '203', unit: 'G', declares: 'protein', factor: asDeclared },
  { number: '205', unit: 'G', declares: 'carbohydrate', factor: asDeclared },
  { number: '205.2', unit: 'G', declares: 'carbohydrate', factor: asDeclared },
  { number: '204', unit: 'G', declares: 'fat', factor: asDeclared },
  { number: '298', unit: 'G', declares: 'fat', factor: asDeclared },
  { number: '291', unit: 'G', declares: 'fibre', factor: asDeclared },
  { number: '293', unit: 'G', declares: 'fibre', factor: asDeclared },
  { number: '221', unit: 'G', declares: 'alcohol', factor: asDeclared },
  { number: '255', unit: 'G', declares: 'water', factor: asDeclared },

  { number: '606', unit: 'G', declares: 'saturated_fat', factor: asDeclared },
  {
    number: '645',
    unit: 'G',
    declares: 'monounsaturated_fat',
    factor: asDeclared,
  },
  {
    number: '646',
    unit: 'G',
    declares: 'polyunsaturated_fat',
    factor: asDeclared,
  },
  { number: '605', unit: 'G', declares: 'trans_fat', factor: asDeclared },
  { number: '601', unit: 'MG', declares: 'cholesterol', factor: asDeclared },

  { number: '269', unit: 'G', declares: 'sugars', factor: asDeclared },
  { number: '269.3', unit: 'G', declares: 'sugars', factor: asDeclared },
  { number: '209', unit: 'G', declares: 'starch', factor: asDeclared },

  { number: '307', unit: 'MG', declares: 'sodium', factor: asDeclared },
  { number: '306', unit: 'MG', declares: 'potassium', factor: asDeclared },
  { number: '301', unit: 'MG', declares: 'calcium', factor: asDeclared },
  { number: '305', unit: 'MG', declares: 'phosphorus', factor: asDeclared },
  { number: '304', unit: 'MG', declares: 'magnesium', factor: asDeclared },
  { number: '303', unit: 'MG', declares: 'iron', factor: asDeclared },
  { number: '309', unit: 'MG', declares: 'zinc', factor: asDeclared },
  { number: '312', unit: 'MG', declares: 'copper', factor: asDeclared },
  { number: '315', unit: 'MG', declares: 'manganese', factor: asDeclared },
  {
    number: '313',
    unit: 'UG',
    declares: 'fluoride',
    factor: microgramsToMilligrams,
  },
  { number: '317', unit: 'UG', declares: 'selenium', factor: asDeclared },
  { number: '316', unit: 'UG', declares: 'molybdenum', factor: asDeclared },
  { number: '314', unit: 'UG', declares: 'iodine', factor: asDeclared },

  { number: '320', unit: 'UG', declares: 'vitamin_a', factor: asDeclared },
  { number: '328', unit: 'UG', declares: 'vitamin_d', factor: asDeclared },
  { number: '323', unit: 'MG', declares: 'vitamin_e', factor: asDeclared },
  { number: '430', unit: 'UG', declares: 'vitamin_k', factor: asDeclared },
  { number: '401', unit: 'MG', declares: 'vitamin_c', factor: asDeclared },
  { number: '404', unit: 'MG', declares: 'thiamin', factor: asDeclared },
  { number: '405', unit: 'MG', declares: 'riboflavin', factor: asDeclared },
  { number: '406', unit: 'MG', declares: 'niacin', factor: asDeclared },
  { number: '415', unit: 'MG', declares: 'vitamin_b6', factor: asDeclared },
  { number: '435', unit: 'UG', declares: 'folate', factor: asDeclared },
  { number: '417', unit: 'UG', declares: 'folate', factor: asDeclared },
  { number: '418', unit: 'UG', declares: 'vitamin_b12', factor: asDeclared },
  { number: '416', unit: 'UG', declares: 'biotin', factor: asDeclared },
  {
    number: '410',
    unit: 'MG',
    declares: 'pantothenic_acid',
    factor: asDeclared,
  },
  { number: '421', unit: 'MG', declares: 'choline', factor: asDeclared },

  { number: '262', unit: 'MG', declares: 'caffeine', factor: asDeclared },
];

export const ignoredUsdaNutrients: Readonly<Record<string, string>> = {
  '202': 'Nitrogen',
  '207': 'Ash',
  '210': 'Sucrose',
  '211': 'Glucose',
  '212': 'Fructose',
  '213': 'Lactose',
  '214': 'Maltose',
  '227': 'Specific Gravity',
  '236': 'Citric acid',
  '243': 'Malic acid',
  '245': 'Oxalic acid',
  '247': 'Pyruvic acid',
  '248': 'Quinic acid',
  '263': 'Theobromine',
  '283': 'Resistant starch',
  '287': 'Galactose',
  '288': 'Raffinose',
  '289': 'Stachyose',
  '293.3': 'High Molecular Weight Dietary Fiber (HMWDF)',
  '293.4': 'Low Molecular Weight Dietary Fiber (LMWDF)',
  '295': 'Fiber, soluble',
  '297': 'Fiber, insoluble',
  '308': 'Sulfur, S',
  '311': 'Cobalt, Co',
  '318': 'Vitamin A, IU',
  '319': 'Retinol',
  '321': 'Carotene, beta',
  '321.1': 'cis-beta-Carotene',
  '321.2': 'trans-beta-Carotene',
  '322': 'Carotene, alpha',
  '324': 'Vitamin D (D2 + D3), International Units',
  '325': 'Vitamin D2 (ergocalciferol)',
  '326': 'Vitamin D3 (cholecalciferol)',
  '327': '25-hydroxycholecalciferol',
  '330': 'Phytoene',
  '331': 'Phytofluene',
  '332': 'Carotene, gamma',
  '334': 'Cryptoxanthin, beta',
  '335': 'Cryptoxanthin, alpha',
  '337': 'Lycopene',
  '337.1': 'cis-Lycopene',
  '337.2': 'trans-Lycopene',
  '338': 'Lutein + zeaxanthin',
  '338.1': 'Lutein',
  '338.2': 'Zeaxanthin',
  '338.3': 'cis-Lutein/Zeaxanthin',
  '341': 'Tocopherol, beta',
  '342': 'Tocopherol, gamma',
  '343': 'Tocopherol, delta',
  '344': 'Tocotrienol, alpha',
  '345': 'Tocotrienol, beta',
  '346': 'Tocotrienol, gamma',
  '347': 'Tocotrienol, delta',
  '354': 'Boron, B',
  '371': 'Nickel, Ni',
  '428': 'Vitamin K (Menaquinone-4)',
  '429': 'Vitamin K (Dihydrophylloquinone)',
  '431': 'Folic acid',
  '432': 'Folate, food',
  '433': '5-methyl tetrahydrofolate (5-MTHF)',
  '436': '10-Formyl folic acid (10HCOFA)',
  '437': '5-Formyltetrahydrofolic acid (5-HCOH4',
  '450': 'Choline, free',
  '451': 'Choline, from phosphocholine',
  '452': 'Choline, from phosphotidyl choline',
  '453': 'Choline, from glycerophosphocholine',
  '454': 'Betaine',
  '455': 'Choline, from sphingomyelin',
  '501': 'Tryptophan',
  '502': 'Threonine',
  '503': 'Isoleucine',
  '504': 'Leucine',
  '505': 'Lysine',
  '506': 'Methionine',
  '507': 'Cystine',
  '508': 'Phenylalanine',
  '509': 'Tyrosine',
  '510': 'Valine',
  '511': 'Arginine',
  '512': 'Histidine',
  '513': 'Alanine',
  '514': 'Aspartic acid',
  '515': 'Glutamic acid',
  '516': 'Glycine',
  '517': 'Proline',
  '518': 'Serine',
  '521': 'Hydroxyproline',
  '526': 'Cysteine',
  '573': 'Vitamin E, added',
  '578': 'Vitamin B-12, added',
  '607': 'SFA 4:0',
  '608': 'SFA 6:0',
  '609': 'SFA 8:0',
  '610': 'SFA 10:0',
  '611': 'SFA 12:0',
  '612': 'SFA 14:0',
  '613': 'SFA 16:0',
  '614': 'SFA 18:0',
  '615': 'SFA 20:0',
  '617': 'MUFA 18:1',
  '618': 'PUFA 18:2',
  '619': 'PUFA 18:3',
  '620': 'PUFA 20:4',
  '621': 'PUFA 22:6 n-3 (DHA)',
  '624': 'SFA 22:0',
  '625': 'MUFA 14:1',
  '626': 'MUFA 16:1',
  '627': 'PUFA 18:4',
  '628': 'MUFA 20:1',
  '629': 'PUFA 20:5 n-3 (EPA)',
  '630': 'MUFA 22:1',
  '631': 'PUFA 22:5 n-3 (DPA)',
  '632': 'SFA 5:0',
  '633': 'SFA 7:0',
  '634': 'SFA 9:0',
  '635': 'MUFA 12:1',
  '636': 'Phytosterols',
  '637': 'Ergosterol',
  '638': 'Stigmasterol',
  '639': 'Campesterol',
  '640': 'Brassicasterol',
  '641': 'Beta-sitosterol',
  '642': 'Campestanol',
  '647': 'Beta-sitostanol',
  '649': 'Delta-5-avenasterol',
  '651': 'Phytosterols, other',
  '652': 'SFA 15:0',
  '653': 'SFA 17:0',
  '654': 'SFA 24:0',
  '662': 'TFA 16:1 t',
  '663': 'TFA 18:1 t',
  '664': 'TFA 22:1 t',
  '665': 'TFA 18:2 t not further defined',
  '666': 'PUFA 18:2 i',
  '669': 'TFA 18:2 t,t',
  '670': 'PUFA 18:2 CLAs',
  '671': 'MUFA 24:1 c',
  '672': 'PUFA 20:2 n-6 c,c',
  '673': 'MUFA 16:1 c',
  '674': 'MUFA 18:1 c',
  '675': 'PUFA 18:2 n-6 c,c',
  '676': 'MUFA 22:1 c',
  '676.1': 'MUFA 22:1 n-9',
  '676.2': 'MUFA 22:1 n-11',
  '681': 'SFA 21:0',
  '682': 'SFA 23:0',
  '683': 'PUFA 22:3',
  '685': 'PUFA 18:3 n-6 c,c,c',
  '687': 'MUFA 17:1',
  '689': 'PUFA 20:3',
  '693': 'Fatty acids, total trans-monoenoic',
  '694': 'Fatty acids, total trans-dienoic',
  '695': 'Fatty acids, total trans-polyenoic',
  '696': 'SFA 13:0',
  '697': 'MUFA 15:1',
  '698': 'PUFA 22:2',
  '699': 'SFA 11:0',
  '710': 'Daidzein',
  '711': 'Genistein',
  '717': 'Daidzin',
  '718': 'Genistin',
  '719': 'Glycitin',
  '821': 'TFA 14:1 t',
  '822': 'MUFA 14:1 c',
  '825': 'MUFA 17:1 c',
  '829': 'MUFA 20:1 c',
  '830': 'TFA 20:1 t',
  '831': 'PUFA 18:2 c',
  '832': 'TFA 18:2 t',
  '833': 'PUFA 18:3 c',
  '834': 'TFA 18:3 t',
  '835': 'PUFA 20:3 c',
  '836': 'PUFA 20:4c',
  '837': 'PUFA 20:5c',
  '838': 'PUFA 22:5 c',
  '839': 'PUFA 22:6 c',
  '840': 'PUFA 20:2 c',
  '851': 'PUFA 18:3 n-3 c,c,c (ALA)',
  '852': 'PUFA 20:3 n-3',
  '853': 'PUFA 20:3 n-6',
  '854': 'PUFA 20:4 n-3',
  '855': 'PUFA 20:4 n-6',
  '856': 'PUFA 18:3i',
  '857': 'PUFA 21:5',
  '858': 'PUFA 22:4',
  '859': 'MUFA 18:1-11 t (18:1t n-7)',
  '860': 'MUFA 18:1-11 c (18:1c n-7)',
  '861': 'PUFA 20:3 n-9',
  '959': 'Vitamin E',
  '961': 'Glutathione',
};

const carbohydrateByDifference = '205';

export const declaredFromUsda = (
  amounts: ReadonlyMap<string, number>,
): DeclaredNutrients => {
  const declared: DeclaredNutrients = {};
  const readFrom = new Map<DeclaredKey, string>();
  for (const { number, declares, factor } of usdaNutrients) {
    const amount = amounts.get(number);
    if (declared[declares] !== undefined || amount === undefined) {
      continue;
    }
    declared[declares] = amount * factor;
    readFrom.set(declares, number);
  }
  const { carbohydrate, fibre } = declared;
  if (
    readFrom.get('carbohydrate') === carbohydrateByDifference &&
    typeof carbohydrate === 'number' &&
    typeof fibre === 'number'
  ) {
    declared.carbohydrate = Math.max(0, carbohydrate - fibre);
  }
  return declared;
};

export type UsdaPortionRow = {
  amount: string;
  unit: string | undefined;
  description: string;
  modifier: string;
  grams: string;
};

const undeterminedUnit = 'undetermined';
const quantityNotSpecified = 'Quantity not specified';
const guidelineAmount = /^Guideline amount\b/;

const amountLabel = (amount: string) => {
  const parsed = Number(amount);
  return amount.trim() === '' || !Number.isFinite(parsed)
    ? undefined
    : String(parsed);
};

const portionLabel = (dataset: UsdaDataset, row: UsdaPortionRow) => {
  const description = row.description.trim();
  if (dataset === 'fndds') {
    return description === quantityNotSpecified ||
      guidelineAmount.test(description)
      ? ''
      : description;
  }
  const unit = row.unit === undeterminedUnit ? undefined : row.unit?.trim();
  const measure = [amountLabel(row.amount), unit].filter(Boolean).join(' ');
  const details = [description, row.modifier.trim()].filter(Boolean).join(', ');
  if (details === '') {
    return measure;
  }
  return unit ? `${measure}, ${details}` : `${measure} ${details}`.trim();
};

export const usdaPortion = (
  dataset: UsdaDataset,
  row: UsdaPortionRow,
): SourcePortion | undefined => {
  const label = portionLabel(dataset, row);
  const grams = Number(row.grams);
  return label !== '' && Number.isFinite(grams) && grams > 0
    ? { label, grams }
    : undefined;
};

export const mergePortions = (
  ...portionLists: readonly (readonly SourcePortion[])[]
): SourcePortion[] => {
  const byLabel = new Map<string, SourcePortion>();
  for (const portion of portionLists.flat()) {
    if (!byLabel.has(portion.label)) {
      byLabel.set(portion.label, portion);
    }
  }
  return [...byLabel.values()];
};

export type UsdaFood = {
  dataset: UsdaDataset;
  code: string;
  name: string;
  publishedOn: string;
  amounts: ReadonlyMap<string, number>;
  portions: readonly SourcePortion[];
};

export type UsdaMapping =
  | { success: true; food: SourceFood }
  | { success: false; reason: string };

export const usdaSourceId = (dataset: UsdaDataset, code: string) =>
  dataset === 'fndds' ? `fndds:${code}` : `ndb:${code}`;

const declaredKeyOf = new Map<string, DeclaredKey>(
  usdaNutrients.map(({ number, declares }) => [number, declares]),
);

export const mergeAmounts = (
  primary: ReadonlyMap<string, number>,
  fallback: ReadonlyMap<string, number>,
): Map<string, number> => {
  const covered = new Set(
    [...primary.keys()].flatMap((number) => declaredKeyOf.get(number) ?? []),
  );
  const merged = new Map(primary);
  for (const [number, amount] of fallback) {
    const declares = declaredKeyOf.get(number);
    if (declares !== undefined && !covered.has(declares)) {
      merged.set(number, amount);
    }
  }
  return merged;
};

export const mergeReferenceFoods = (
  foundation: UsdaFood,
  srLegacy: UsdaFood,
): UsdaFood => ({
  ...foundation,
  amounts: mergeAmounts(foundation.amounts, srLegacy.amounts),
  portions: [...foundation.portions, ...srLegacy.portions],
});

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const lastModifiedFrom = (publishedOn: string) =>
  isoDate.test(publishedOn) ? `${publishedOn}T00:00:00.000Z` : null;

export const sourceFoodFromUsda = (food: UsdaFood): UsdaMapping => {
  const sourceId = usdaSourceId(food.dataset, food.code);
  const nutrition = normaliseNutrients(declaredFromUsda(food.amounts));
  if (nutrition.nutrients.energy_kcal === undefined) {
    return { success: false, reason: `${sourceId}: declares no energy` };
  }
  const parsed = sourceFoodSchema.safeParse({
    source: 'usda',
    sourceId,
    barcode: null,
    name: food.name.trim(),
    brand: null,
    quantityLabel: null,
    ...nutrition,
    portions: mergePortions(food.portions),
    lastModified: lastModifiedFrom(food.publishedOn),
  });
  return parsed.success
    ? { success: true, food: parsed.data }
    : {
        success: false,
        reason: `${sourceId}: ${z.prettifyError(parsed.error)}`,
      };
};
