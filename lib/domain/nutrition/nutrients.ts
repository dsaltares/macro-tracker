export const nutrientUnits = ['kcal', 'g', 'mg', 'µg'] as const;

export type NutrientUnit = (typeof nutrientUnits)[number];

export const nutrientGroups = [
  'energy',
  'macros',
  'fat_detail',
  'carbohydrate_detail',
  'minerals',
  'vitamins',
  'other',
] as const;

export type NutrientGroup = (typeof nutrientGroups)[number];

const canon = [
  { key: 'energy_kcal', unit: 'kcal', group: 'energy' },

  { key: 'protein', unit: 'g', group: 'macros' },
  { key: 'carbohydrate', unit: 'g', group: 'macros' },
  { key: 'fat', unit: 'g', group: 'macros' },
  { key: 'fibre', unit: 'g', group: 'macros' },
  { key: 'alcohol', unit: 'g', group: 'macros' },
  { key: 'water', unit: 'g', group: 'macros' },

  { key: 'saturated_fat', unit: 'g', group: 'fat_detail' },
  { key: 'monounsaturated_fat', unit: 'g', group: 'fat_detail' },
  { key: 'polyunsaturated_fat', unit: 'g', group: 'fat_detail' },
  { key: 'trans_fat', unit: 'g', group: 'fat_detail' },
  { key: 'omega_3', unit: 'g', group: 'fat_detail' },
  { key: 'omega_6', unit: 'g', group: 'fat_detail' },
  { key: 'cholesterol', unit: 'mg', group: 'fat_detail' },

  { key: 'sugars', unit: 'g', group: 'carbohydrate_detail' },
  { key: 'added_sugars', unit: 'g', group: 'carbohydrate_detail' },
  { key: 'starch', unit: 'g', group: 'carbohydrate_detail' },
  { key: 'polyols', unit: 'g', group: 'carbohydrate_detail' },

  { key: 'sodium', unit: 'mg', group: 'minerals' },
  { key: 'potassium', unit: 'mg', group: 'minerals' },
  { key: 'chloride', unit: 'mg', group: 'minerals' },
  { key: 'calcium', unit: 'mg', group: 'minerals' },
  { key: 'phosphorus', unit: 'mg', group: 'minerals' },
  { key: 'magnesium', unit: 'mg', group: 'minerals' },
  { key: 'iron', unit: 'mg', group: 'minerals' },
  { key: 'zinc', unit: 'mg', group: 'minerals' },
  { key: 'copper', unit: 'mg', group: 'minerals' },
  { key: 'manganese', unit: 'mg', group: 'minerals' },
  { key: 'fluoride', unit: 'mg', group: 'minerals' },
  { key: 'selenium', unit: 'µg', group: 'minerals' },
  { key: 'chromium', unit: 'µg', group: 'minerals' },
  { key: 'molybdenum', unit: 'µg', group: 'minerals' },
  { key: 'iodine', unit: 'µg', group: 'minerals' },

  { key: 'vitamin_a', unit: 'µg', group: 'vitamins' },
  { key: 'vitamin_d', unit: 'µg', group: 'vitamins' },
  { key: 'vitamin_e', unit: 'mg', group: 'vitamins' },
  { key: 'vitamin_k', unit: 'µg', group: 'vitamins' },
  { key: 'vitamin_c', unit: 'mg', group: 'vitamins' },
  { key: 'thiamin', unit: 'mg', group: 'vitamins' },
  { key: 'riboflavin', unit: 'mg', group: 'vitamins' },
  { key: 'niacin', unit: 'mg', group: 'vitamins' },
  { key: 'vitamin_b6', unit: 'mg', group: 'vitamins' },
  { key: 'folate', unit: 'µg', group: 'vitamins' },
  { key: 'vitamin_b12', unit: 'µg', group: 'vitamins' },
  { key: 'biotin', unit: 'µg', group: 'vitamins' },
  { key: 'pantothenic_acid', unit: 'mg', group: 'vitamins' },
  { key: 'choline', unit: 'mg', group: 'vitamins' },

  { key: 'caffeine', unit: 'mg', group: 'other' },
] as const satisfies readonly {
  key: string;
  unit: NutrientUnit;
  group: NutrientGroup;
}[];

export type NutrientKey = (typeof canon)[number]['key'];

export const euLabelKeys = [
  'energy_kcal',
  'fat',
  'saturated_fat',
  'carbohydrate',
  'sugars',
  'protein',
  'sodium',
] as const satisfies readonly NutrientKey[];

export type Nutrient = {
  key: NutrientKey;
  unit: NutrientUnit;
  group: NutrientGroup;
  order: number;
  euMandatory: boolean;
};

const euMandatoryKeys: ReadonlySet<NutrientKey> = new Set(euLabelKeys);

export const nutrients: readonly Nutrient[] = canon.map(
  ({ key, unit, group }, order) => ({
    key,
    unit,
    group,
    order,
    euMandatory: euMandatoryKeys.has(key),
  }),
);

export const nutrientKeys: readonly NutrientKey[] = nutrients.map(
  ({ key }) => key,
);

export const nutrientByKey = Object.fromEntries(
  nutrients.map((nutrient) => [nutrient.key, nutrient]),
) as Record<NutrientKey, Nutrient>;
