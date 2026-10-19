import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  nutrientByKey,
  nutrientKeys,
} from '../../../domain/nutrition/nutrients.ts';
import {
  declaredFromOff,
  declaresNutritionFacts,
  ignoredOffNutriments,
  type OffProduct,
  offNutriments,
  offProductSchema,
  sourceFoodFromOff,
} from './mapping.ts';

const exportHeader = readFileSync('test/fixtures/off/export-header.tsv', 'utf8')
  .trim()
  .split('\t');

const realProducts = readFileSync('test/fixtures/off/products.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map((line) => offProductSchema.parse(JSON.parse(line)));

const realProduct = (code: string) => {
  const product = realProducts.find((candidate) => candidate.code === code);
  if (!product) {
    throw new Error(`No real product ${code} in the fixture`);
  }
  return product;
};

const nutrimentSuffix = '_100g';
const baseKeyOf = (nutrimentKey: string) => nutrimentKey.split('_')[0] ?? '';

const mappedKeys = new Set(offNutriments.map(({ off }) => off));
const ignoredKeys = new Set(ignoredOffNutriments);
const unmapped = (keys: Iterable<string>) =>
  [...new Set(keys)].filter(
    (key) => !mappedKeys.has(key) && !ignoredKeys.has(key),
  );

describe('the Open Food Facts nutriment table', () => {
  it('reads exactly these keys, in this order of precedence, with these factors', () => {
    expect(
      offNutriments.map(({ off, declares, factor }) => [off, declares, factor]),
    ).toEqual([
      ['energy-kcal', 'energy_kcal', 1],
      ['energy-kj', 'energy_kj', 1],
      ['energy', 'energy_kj', 1],
      ['proteins', 'protein', 1],
      ['carbohydrates', 'carbohydrate', 1],
      ['fat', 'fat', 1],
      ['fiber', 'fibre', 1],
      ['alcohol', 'alcohol', 0.789],
      ['water', 'water', 1],
      ['saturated-fat', 'saturated_fat', 1],
      ['monounsaturated-fat', 'monounsaturated_fat', 1],
      ['polyunsaturated-fat', 'polyunsaturated_fat', 1],
      ['trans-fat', 'trans_fat', 1],
      ['omega-3-fat', 'omega_3', 1],
      ['omega-6-fat', 'omega_6', 1],
      ['cholesterol', 'cholesterol', 1_000],
      ['sugars', 'sugars', 1],
      ['added-sugars', 'added_sugars', 1],
      ['starch', 'starch', 1],
      ['polyols', 'polyols', 1],
      ['sodium', 'sodium', 1_000],
      ['salt', 'salt', 1],
      ['potassium', 'potassium', 1_000],
      ['chloride', 'chloride', 1_000],
      ['calcium', 'calcium', 1_000],
      ['phosphorus', 'phosphorus', 1_000],
      ['magnesium', 'magnesium', 1_000],
      ['iron', 'iron', 1_000],
      ['zinc', 'zinc', 1_000],
      ['copper', 'copper', 1_000],
      ['manganese', 'manganese', 1_000],
      ['fluoride', 'fluoride', 1_000],
      ['selenium', 'selenium', 1_000_000],
      ['chromium', 'chromium', 1_000_000],
      ['molybdenum', 'molybdenum', 1_000_000],
      ['iodine', 'iodine', 1_000_000],
      ['vitamin-a', 'vitamin_a', 1_000_000],
      ['vitamin-d', 'vitamin_d', 1_000_000],
      ['vitamin-e', 'vitamin_e', 1_000],
      ['vitamin-k', 'vitamin_k', 1_000_000],
      ['phylloquinone', 'vitamin_k', 1_000_000],
      ['vitamin-c', 'vitamin_c', 1_000],
      ['vitamin-b1', 'thiamin', 1_000],
      ['vitamin-b2', 'riboflavin', 1_000],
      ['vitamin-pp', 'niacin', 1_000],
      ['vitamin-b6', 'vitamin_b6', 1_000],
      ['vitamin-b9', 'folate', 1_000_000],
      ['folates', 'folate', 1_000_000],
      ['vitamin-b12', 'vitamin_b12', 1_000_000],
      ['biotin', 'biotin', 1_000_000],
      ['pantothenic-acid', 'pantothenic_acid', 1_000],
      ['choline', 'choline', 1_000],
      ['caffeine', 'caffeine', 1_000],
    ]);
  });

  it('converts from grams, the unit Open Food Facts gives every nutriment in, to the canonical unit', () => {
    const fromGrams = { g: 1, mg: 1_000, µg: 1_000_000, kcal: 1 };
    const declaredInOtherUnits = new Set(['energy_kcal', 'alcohol']);

    for (const { declares, factor } of offNutriments) {
      if (declares in nutrientByKey && !declaredInOtherUnits.has(declares)) {
        expect(factor, declares).toBe(
          fromGrams[nutrientByKey[declares as keyof typeof nutrientByKey].unit],
        );
      }
    }
  });

  it('gives every canonical nutrient an Open Food Facts key', () => {
    const declared = new Set(offNutriments.map(({ declares }) => declares));

    expect(nutrientKeys.filter((key) => !declared.has(key))).toEqual([]);
  });

  it('maps or deliberately ignores every nutriment column of the export', () => {
    const columns = exportHeader
      .filter((column) => column.endsWith(nutrimentSuffix))
      .map(baseKeyOf);

    expect(columns.length).toBeGreaterThan(100);
    expect(unmapped(columns)).toEqual([]);
  });

  it('maps or deliberately ignores every nutriment key on real products', () => {
    const keys = realProducts.flatMap((product) =>
      Object.keys(product.nutriments).map(baseKeyOf),
    );

    expect(unmapped(keys)).toEqual([]);
  });

  it('catches a key it neither maps nor ignores', () => {
    expect(unmapped(['proteins', 'nova-group', 'vitamin-z'])).toEqual([
      'vitamin-z',
    ]);
  });

  it('never both maps and ignores a key', () => {
    expect(ignoredOffNutriments.filter((key) => mappedKeys.has(key))).toEqual(
      [],
    );
    expect(ignoredKeys.size).toBe(ignoredOffNutriments.length);
  });
});

describe('declaredFromOff', () => {
  it('reads the per-100 g value of every key it maps, converted', () => {
    expect(
      declaredFromOff(
        {
          'energy-kcal_100g': 539,
          'energy-kcal_serving': 81,
          proteins_100g: 6.3,
          sodium_100g: 0.04,
          'vitamin-d_100g': 0.0000025,
          alcohol_100g: 5,
        },
        '100g',
      ),
    ).toEqual({
      energy_kcal: 539,
      protein: 6.3,
      sodium: expect.closeTo(40),
      vitamin_d: expect.closeTo(2.5),
      alcohol: expect.closeTo(3.945),
    });
  });

  it('reads the per-serving values when asked to', () => {
    expect(
      declaredFromOff({ fat_100g: 30, fat_serving: 4.5 }, 'serving'),
    ).toEqual({ fat: 4.5 });
  });

  it('keeps the first key present when two declare the same nutrient', () => {
    expect(
      declaredFromOff(
        {
          'energy-kj_100g': 2252,
          energy_100g: 2000,
          'vitamin-b9_100g': 0.0001,
          folates_100g: 0.0002,
        },
        '100g',
      ),
    ).toEqual({ energy_kj: 2252, folate: 100 });
  });

  it('falls back to the next key when the first is unreadable', () => {
    expect(
      declaredFromOff({ 'energy-kj_100g': '', energy_100g: '1000' }, '100g'),
    ).toEqual({ energy_kj: 1000 });
  });

  it('reads string values as the CSV export gives them', () => {
    expect(
      declaredFromOff({ sugars_100g: '12.5', salt_100g: '1.2' }, '100g'),
    ).toEqual({ sugars: 12.5, salt: 1.2 });
  });

  it('declares a trace for a value modified by "<" or "≤"', () => {
    expect(
      declaredFromOff(
        {
          sugars_100g: 0.5,
          sugars_modifier: '<',
          salt_100g: 0.01,
          salt_modifier: '≤',
        },
        '100g',
      ),
    ).toEqual({ sugars: 'traces', salt: 'traces' });
  });

  it('declares a trace for a value written as one', () => {
    expect(declaredFromOff({ sugars_100g: '<0.5' }, '100g')).toEqual({
      sugars: 'traces',
    });
  });

  it('keeps an estimated value, modified by "~", as it is', () => {
    expect(
      declaredFromOff({ sodium_100g: 0.0428, sodium_modifier: '~' }, '100g'),
    ).toEqual({ sodium: 42.8 });
  });

  it('skips what it does not map and what is not a value', () => {
    expect(
      declaredFromOff(
        {
          'nova-group_100g': 4,
          calcium_prepared_100g: 0.118,
          fat_100g: null,
          fiber_100g: { value: 3 },
          proteins_unit: 'g',
        },
        '100g',
      ),
    ).toEqual({});
  });
});

describe('declaresNutritionFacts', () => {
  it('holds for energy and at least one macro per 100 g', () => {
    expect(
      declaresNutritionFacts({ 'energy-kcal_100g': 102, proteins_100g: 19 }),
    ).toBe(true);
    expect(declaresNutritionFacts({ energy_100g: '427', fat_100g: '0' })).toBe(
      true,
    );
    expect(
      declaresNutritionFacts({
        'energy-kj_100g': 1463,
        carbohydrates_100g: 77,
      }),
    ).toBe(true);
  });

  it('does not hold without declared energy, even when the macros would give it', () => {
    expect(declaresNutritionFacts({ proteins_100g: 19, fat_100g: 2.5 })).toBe(
      false,
    );
  });

  it('does not hold for energy alone, or a nutrient that is not a macro', () => {
    expect(declaresNutritionFacts({ 'energy-kcal_100g': 102 })).toBe(false);
    expect(
      declaresNutritionFacts({ 'energy-kcal_100g': 102, salt_100g: 1.9 }),
    ).toBe(false);
  });

  it('does not hold for values declared only per serving', () => {
    expect(
      declaresNutritionFacts({
        'energy-kcal_serving': 81,
        proteins_serving: 2,
      }),
    ).toBe(false);
  });

  it('does not hold for empty values', () => {
    expect(
      declaresNutritionFacts({ 'energy-kcal_100g': '', proteins_100g: '' }),
    ).toBe(false);
  });
});

const product: OffProduct = {
  code: '8410076472960',
  product_name: '  Fajitas ',
  brands: 'Old El Paso, General Mills',
  quantity: '500 g',
  serving_size: '1 tortilla (40 g)',
  serving_quantity: 40,
  last_modified_t: 1792161297,
  nutriments: {
    'energy-kcal_100g': 300,
    proteins_100g: 8,
    salt_100g: 1.5,
    sugars_100g: 0.5,
    sugars_modifier: '<',
  },
};

describe('sourceFoodFromOff', () => {
  it('maps a product to a source food', () => {
    expect(sourceFoodFromOff(product)).toEqual({
      success: true,
      food: {
        source: 'off',
        sourceId: '8410076472960',
        barcode: '8410076472960',
        name: 'Fajitas',
        brand: 'Old El Paso',
        quantityLabel: '500 g',
        nutrients: { energy_kcal: 300, protein: 8, sodium: 600, sugars: 0 },
        traces: ['sugars'],
        portions: [{ label: '1 tortilla (40 g)', grams: 40 }],
        lastModified: '2026-10-16T14:34:57.000Z',
      },
    });
  });

  it('maps a real product', () => {
    expect(sourceFoodFromOff(realProduct('8480000592569'))).toEqual({
      success: true,
      food: {
        source: 'off',
        sourceId: '8480000592569',
        barcode: '8480000592569',
        name: 'Jamón cocido lonchas',
        brand: 'MERCADONA',
        quantityLabel: '200 g',
        nutrients: {
          energy_kcal: 102,
          protein: 19,
          carbohydrate: 0.9,
          fat: 2.5,
          saturated_fat: 0.9,
          sugars: 0.9,
          added_sugars: 1.32,
          sodium: 760,
        },
        traces: [],
        portions: [],
        lastModified: '2026-10-15T18:42:40.000Z',
      },
    });
  });

  it('maps every real product with a valid code', () => {
    const mapped = realProducts.map(sourceFoodFromOff);

    expect(mapped.filter(({ success }) => success)).toHaveLength(5);
    expect(
      mapped.flatMap((result) => (result.success ? [] : [result.reason])),
    ).toEqual([
      '00001682: not a valid EAN-8, EAN-13 or UPC-A',
      '0000200000005: not a valid EAN-8, EAN-13 or UPC-A',
    ]);
  });

  it('reads nothing from values given only as prepared', () => {
    const nesquik = sourceFoodFromOff(realProduct('3033710065967'));

    expect(nesquik.success && nesquik.food.nutrients).toEqual({});
  });

  it('keeps an EAN-8 as it is', () => {
    const tartines = sourceFoodFromOff(realProduct('00005401'));

    expect(tartines.success && tartines.food.barcode).toBe('00005401');
  });

  it('normalises a UPC-A barcode and keeps the upstream code as the source id', () => {
    const upc = sourceFoodFromOff({ ...product, code: '036000291452' });

    expect(upc.success && [upc.food.sourceId, upc.food.barcode]).toEqual([
      '036000291452',
      '0036000291452',
    ]);
  });

  it('rejects a code that is not a valid barcode', () => {
    expect(sourceFoodFromOff({ ...product, code: '8410076472961' })).toEqual({
      success: false,
      reason: '8410076472961: not a valid EAN-8, EAN-13 or UPC-A',
    });
  });

  it('rejects a product with no name, saying why', () => {
    const nameless = sourceFoodFromOff({ ...product, product_name: ' ' });

    expect(nameless.success).toBe(false);
    expect(!nameless.success && nameless.reason).toMatch(
      /^8410076472960: .*name/s,
    );
  });

  it('scales values declared only per serving to 100 g', () => {
    const perServing = sourceFoodFromOff({
      ...product,
      serving_quantity: '30',
      nutriments: {
        'energy-kcal_serving': 120,
        proteins_serving: 3,
        salt_serving: 0.15,
      },
    });

    expect(perServing.success && perServing.food.nutrients).toEqual({
      energy_kcal: 400,
      protein: 10,
      sodium: 200,
    });
  });

  it('prefers per-100 g values when a product declares both', () => {
    const both = sourceFoodFromOff({
      ...product,
      nutriments: { fat_100g: 10, fat_serving: 99 },
    });

    expect(both.success && both.food.nutrients).toEqual({
      fat: 10,
      energy_kcal: 90,
    });
  });

  it('ignores per-serving values when it does not know the serving weight', () => {
    const unknownServing = sourceFoodFromOff({
      ...product,
      serving_quantity: null,
      nutriments: { fat_serving: 4 },
    });

    expect(unknownServing.success && unknownServing.food).toMatchObject({
      nutrients: {},
      portions: [],
    });
  });

  it('labels a serving with no size by its weight', () => {
    const unlabelled = sourceFoodFromOff({ ...product, serving_size: '' });

    expect(unlabelled.success && unlabelled.food.portions).toEqual([
      { label: '40 g', grams: 40 },
    ]);
  });

  it('leaves out a serving of no weight', () => {
    const empty = sourceFoodFromOff({ ...product, serving_quantity: 0 });

    expect(empty.success && empty.food.portions).toEqual([]);
  });

  it('is null where the product says nothing', () => {
    const sparse = sourceFoodFromOff({
      code: '8410076472960',
      product_name: 'Fajitas',
    });

    expect(sparse).toEqual({
      success: true,
      food: {
        source: 'off',
        sourceId: '8410076472960',
        barcode: '8410076472960',
        name: 'Fajitas',
        brand: null,
        quantityLabel: null,
        nutrients: {},
        traces: [],
        portions: [],
        lastModified: null,
      },
    });
  });

  it('reads a last modified time given as a string', () => {
    const fromCsv = sourceFoodFromOff({
      ...product,
      last_modified_t: '1700000000',
    });

    expect(fromCsv.success && fromCsv.food.lastModified).toBe(
      '2023-11-14T22:13:20.000Z',
    );
  });
});
