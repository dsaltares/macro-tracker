import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nutrientKeys } from '../../../domain/nutrition/nutrients.ts';
import {
  declaredFromUsda,
  ignoredUsdaNutrients,
  mergeAmounts,
  mergePortions,
  mergeReferenceFoods,
  sourceFoodFromUsda,
  type UsdaDataset,
  type UsdaFood,
  usdaDatasets,
  usdaNutrients,
  usdaPortion,
  usdaSourceId,
} from './mapping.ts';

const fixtureRecords = (dataset: UsdaDataset, file: string) => {
  const [header, ...rows] = readFileSync(
    `test/fixtures/usda/${dataset}/${file}`,
    'utf8',
  )
    .trim()
    .split('\n')
    .map((line) => line.slice(1, -1).split('","'));
  return rows.map((row) =>
    Object.fromEntries((header ?? []).map((column, at) => [column, row[at]])),
  );
};

const nutrientsOf = (dataset: UsdaDataset) =>
  fixtureRecords(dataset, 'nutrient.csv').filter(
    ({ nutrient_nbr }) => nutrient_nbr,
  );

const numbersRead = (dataset: UsdaDataset) => {
  const numberOfId = new Map(
    nutrientsOf(dataset).map(({ id, nutrient_nbr }) => [id, nutrient_nbr]),
  );
  return fixtureRecords(dataset, 'food_nutrient.csv').flatMap(
    ({ nutrient_id = '' }) => {
      const number =
        dataset === 'fndds' ? nutrient_id : numberOfId.get(nutrient_id);
      return number ? [number] : [];
    },
  );
};

const mappedNumbers = new Set(usdaNutrients.map(({ number }) => number));
const ignoredNumbers = new Set(Object.keys(ignoredUsdaNutrients));

const amounts = (entries: Record<string, number>) =>
  new Map(Object.entries(entries));

describe('the USDA nutrient table', () => {
  it('reads exactly these nutrient numbers, in this order of precedence, with these factors', () => {
    expect(
      usdaNutrients.map(({ number, declares, factor }) => [
        number,
        declares,
        factor,
      ]),
    ).toEqual([
      ['208', 'energy_kcal', 1],
      ['958', 'energy_kcal', 1],
      ['957', 'energy_kcal', 1],
      ['268', 'energy_kj', 1],
      ['203', 'protein', 1],
      ['205', 'carbohydrate', 1],
      ['205.2', 'carbohydrate', 1],
      ['204', 'fat', 1],
      ['298', 'fat', 1],
      ['291', 'fibre', 1],
      ['293', 'fibre', 1],
      ['221', 'alcohol', 1],
      ['255', 'water', 1],
      ['606', 'saturated_fat', 1],
      ['645', 'monounsaturated_fat', 1],
      ['646', 'polyunsaturated_fat', 1],
      ['605', 'trans_fat', 1],
      ['601', 'cholesterol', 1],
      ['269', 'sugars', 1],
      ['269.3', 'sugars', 1],
      ['209', 'starch', 1],
      ['307', 'sodium', 1],
      ['306', 'potassium', 1],
      ['301', 'calcium', 1],
      ['305', 'phosphorus', 1],
      ['304', 'magnesium', 1],
      ['303', 'iron', 1],
      ['309', 'zinc', 1],
      ['312', 'copper', 1],
      ['315', 'manganese', 1],
      ['313', 'fluoride', 0.001],
      ['317', 'selenium', 1],
      ['316', 'molybdenum', 1],
      ['314', 'iodine', 1],
      ['320', 'vitamin_a', 1],
      ['328', 'vitamin_d', 1],
      ['323', 'vitamin_e', 1],
      ['430', 'vitamin_k', 1],
      ['401', 'vitamin_c', 1],
      ['404', 'thiamin', 1],
      ['405', 'riboflavin', 1],
      ['406', 'niacin', 1],
      ['415', 'vitamin_b6', 1],
      ['435', 'folate', 1],
      ['417', 'folate', 1],
      ['418', 'vitamin_b12', 1],
      ['416', 'biotin', 1],
      ['410', 'pantothenic_acid', 1],
      ['421', 'choline', 1],
      ['262', 'caffeine', 1],
    ]);
  });

  it.each(usdaDatasets)(
    'maps or ignores every nutrient number the real %s dataset reads',
    (dataset) => {
      const unmapped = [...new Set(numbersRead(dataset))].filter(
        (number) => !mappedNumbers.has(number) && !ignoredNumbers.has(number),
      );

      expect(unmapped).toEqual([]);
    },
  );

  it.each(usdaDatasets)(
    'reads each mapped number in the unit the real %s dataset declares for it',
    (dataset) => {
      const unitOf = new Map(
        nutrientsOf(dataset).map(({ nutrient_nbr, unit_name }) => [
          nutrient_nbr,
          unit_name,
        ]),
      );

      for (const { number, unit } of usdaNutrients) {
        expect([number, unitOf.get(number)]).toEqual([number, unit]);
      }
    },
  );

  it('never both maps and ignores a number', () => {
    expect([...mappedNumbers].filter((n) => ignoredNumbers.has(n))).toEqual([]);
  });

  it('reads a number for every canonical nutrient the datasets carry', () => {
    const declared = new Set(usdaNutrients.map(({ declares }) => declares));
    const unread = nutrientKeys.filter((key) => !declared.has(key));

    expect(unread).toEqual([
      'omega_3',
      'omega_6',
      'added_sugars',
      'polyols',
      'chloride',
      'chromium',
    ]);
  });
});

describe('declaredFromUsda', () => {
  it('takes the first number of the table that a food declares for a nutrient', () => {
    expect(
      declaredFromUsda(amounts({ '957': 120, '958': 110, '268': 500 })),
    ).toEqual({ energy_kcal: 110, energy_kj: 500 });
  });

  it('converts fluoride from micrograms to milligrams', () => {
    expect(declaredFromUsda(amounts({ '313': 250 }))).toEqual({
      fluoride: 0.25,
    });
  });

  it('takes the fibre out of carbohydrate by difference', () => {
    expect(declaredFromUsda(amounts({ '205': 12.5, '291': 2.5 }))).toEqual({
      carbohydrate: 10,
      fibre: 2.5,
    });
  });

  it('never takes more fibre out than there is carbohydrate', () => {
    expect(declaredFromUsda(amounts({ '205': 1, '291': 3 }))).toEqual({
      carbohydrate: 0,
      fibre: 3,
    });
  });

  it('keeps carbohydrate by summation as is: it never counted fibre', () => {
    expect(declaredFromUsda(amounts({ '205.2': 12.5, '291': 2.5 }))).toEqual({
      carbohydrate: 12.5,
      fibre: 2.5,
    });
  });

  it('ignores numbers it does not map', () => {
    expect(declaredFromUsda(amounts({ '207': 1.2, '203': 3 }))).toEqual({
      protein: 3,
    });
  });
});

describe('usdaPortion', () => {
  const row = {
    amount: '1',
    unit: 'undetermined',
    description: '',
    modifier: '',
    grams: '100',
  };

  it('labels an SR Legacy portion by its amount and modifier', () => {
    expect(
      usdaPortion('sr-legacy', {
        ...row,
        modifier: 'cup, chopped',
        grams: '89',
      }),
    ).toEqual({ label: '1 cup, chopped', grams: 89 });
  });

  it('labels a Foundation portion by its amount, unit and modifier', () => {
    expect(
      usdaPortion('foundation', {
        ...row,
        amount: '1.0',
        unit: 'cup',
        modifier: 'cubes',
        grams: '160.0',
      }),
    ).toEqual({ label: '1 cup, cubes', grams: 160 });
    expect(
      usdaPortion('foundation', {
        ...row,
        amount: '100.0',
        unit: 'milliliter',
      }),
    ).toEqual({ label: '100 milliliter', grams: 100 });
  });

  it('labels an FNDDS portion by its description, never by its portion code', () => {
    expect(
      usdaPortion('fndds', {
        ...row,
        amount: '',
        description: '1 cup',
        modifier: '10205',
        grams: '246.0',
      }),
    ).toEqual({ label: '1 cup', grams: 246 });
  });

  it('drops an FNDDS guideline amount: it is a WIC allowance, not a measure', () => {
    expect(
      usdaPortion('fndds', {
        ...row,
        description: 'Guideline amount per fl oz of beverage',
        grams: '2.5',
      }),
    ).toBeUndefined();
  });

  it('drops an FNDDS quantity that is not specified', () => {
    expect(
      usdaPortion('fndds', { ...row, description: 'Quantity not specified' }),
    ).toBeUndefined();
  });

  it('drops a portion that weighs nothing or has no label', () => {
    expect(
      usdaPortion('sr-legacy', { ...row, modifier: 'cup', grams: '0' }),
    ).toBeUndefined();
    expect(
      usdaPortion('foundation', { ...row, amount: '', unit: 'undetermined' }),
    ).toBeUndefined();
  });
});

describe('mergePortions', () => {
  it('keeps the first portion with each label', () => {
    expect(
      mergePortions(
        [{ label: '1 cup', grams: 244 }],
        [
          { label: '1 cup', grams: 246 },
          { label: '1 fl oz', grams: 30.5 },
        ],
      ),
    ).toEqual([
      { label: '1 cup', grams: 244 },
      { label: '1 fl oz', grams: 30.5 },
    ]);
  });
});

describe('sourceFoodFromUsda', () => {
  const food: UsdaFood = {
    dataset: 'sr-legacy',
    code: '11109',
    name: ' Cabbage, raw ',
    publishedOn: '2019-04-01',
    amounts: amounts({ '208': 25, '203': 1.28, '205': 5.8, '291': 2.5 }),
    portions: [{ label: '1 cup, chopped', grams: 89 }],
  };

  it('maps a Foundation or SR Legacy food to a generic USDA food keyed by NDB number', () => {
    expect(sourceFoodFromUsda(food)).toEqual({
      success: true,
      food: {
        source: 'usda',
        sourceId: 'ndb:11109',
        barcode: null,
        name: 'Cabbage, raw',
        brand: null,
        quantityLabel: null,
        nutrients: {
          energy_kcal: 25,
          protein: 1.28,
          carbohydrate: 3.3,
          fibre: 2.5,
        },
        traces: [],
        portions: [{ label: '1 cup, chopped', grams: 89 }],
        lastModified: '2019-04-01T00:00:00.000Z',
      },
    });
  });

  it('derives energy from the macros when no energy is declared', () => {
    const mapping = sourceFoodFromUsda({
      ...food,
      amounts: amounts({ '203': 10 }),
    });

    expect(mapping.success && mapping.food.nutrients.energy_kcal).toBe(40);
  });

  it('rejects a food that declares neither energy nor a macro', () => {
    expect(
      sourceFoodFromUsda({ ...food, amounts: amounts({ '301': 40 }) }),
    ).toEqual({
      success: false,
      reason: 'ndb:11109: declares no energy',
    });
  });

  it('rejects a food without a name', () => {
    const mapping = sourceFoodFromUsda({ ...food, name: '  ' });

    expect(mapping.success).toBe(false);
  });

  it('has no last-modified time when the publication date is missing', () => {
    const mapping = sourceFoodFromUsda({ ...food, publishedOn: '' });

    expect(mapping.success && mapping.food.lastModified).toBeNull();
  });
});

describe('mergeAmounts', () => {
  it('keeps every nutrient the first declares and fills the rest from the second', () => {
    expect(
      mergeAmounts(
        amounts({ '208': 60, '203': 3.27 }),
        amounts({ '208': 61, '203': 3.15, '430': 0.3 }),
      ),
    ).toEqual(amounts({ '208': 60, '203': 3.27, '430': 0.3 }));
  });

  it('fills a nutrient by nutrient, never by number, so precedence cannot reach past the first', () => {
    expect(
      mergeAmounts(
        amounts({ '958': 60, '417': 0 }),
        amounts({ '208': 61, '435': 5 }),
      ),
    ).toEqual(amounts({ '958': 60, '417': 0 }));
  });
});

describe('mergeReferenceFoods', () => {
  it('keeps the Foundation food, with SR Legacy nutrients it lacks and SR Legacy portions after its own', () => {
    const foundation: UsdaFood = {
      dataset: 'foundation',
      code: '1077',
      name: 'Milk, whole, 3.25% milkfat, with added vitamin D',
      publishedOn: '2019-12-16',
      amounts: amounts({ '208': 60 }),
      portions: [{ label: '1 cup', grams: 249 }],
    };

    expect(
      mergeReferenceFoods(foundation, {
        ...foundation,
        dataset: 'sr-legacy',
        name: 'Milk, whole',
        publishedOn: '2019-04-01',
        amounts: amounts({ '208': 61, '430': 0.3 }),
        portions: [
          { label: '1 cup', grams: 244 },
          { label: '1 tbsp', grams: 15 },
        ],
      }),
    ).toEqual({
      ...foundation,
      amounts: amounts({ '208': 60, '430': 0.3 }),
      portions: [
        { label: '1 cup', grams: 249 },
        { label: '1 cup', grams: 244 },
        { label: '1 tbsp', grams: 15 },
      ],
    });
  });
});

describe('usdaSourceId', () => {
  it('keys Foundation and SR Legacy foods by their shared NDB number, FNDDS foods by food code', () => {
    expect(usdaSourceId('foundation', '1077')).toBe('ndb:1077');
    expect(usdaSourceId('sr-legacy', '1077')).toBe('ndb:1077');
    expect(usdaSourceId('fndds', '11111000')).toBe('fndds:11111000');
  });
});
