import { describe, expect, it } from 'vitest';
import {
  isUnsure,
  type LabelReading,
  labelReadingSchema,
  labelReadingToFood,
  type PrintedNutrient,
} from './label-reading.ts';

const value = (
  nutrient: PrintedNutrient['nutrient'],
  printed: string,
  unit: PrintedNutrient['unit'],
  confidence = 0.9,
): PrintedNutrient => ({ nutrient, printed, unit, confidence });

const reading: LabelReading = {
  productName: { value: 'Oat biscuits', confidence: 0.95 },
  brand: { value: 'Brand', confidence: 0.8 },
  netQuantity: { value: '300 g', confidence: 0.7 },
  servingSize: { label: '1 biscuit', amount: 12.5, unit: 'g', confidence: 0.6 },
  per100g: [
    value('energy_kj', '1960', 'kJ'),
    value('energy_kcal', '468', 'kcal'),
    value('fat', '20', 'g'),
    value('saturated_fat', '8,4', 'g'),
    value('carbohydrate', '62', 'g'),
    value('sugars', '21', 'g', 0.4),
    value('protein', '6.5', 'g'),
    value('salt', '0.75', 'g'),
  ],
  perServing: [value('energy_kcal', '59', 'kcal')],
  notes: [],
};

const issuesOf = (candidate: unknown) =>
  labelReadingSchema
    .safeParse(candidate)
    .error?.issues.map(({ path }) => path.join('.'));

describe('labelReadingSchema', () => {
  it('accepts a complete reading', () => {
    expect(labelReadingSchema.parse(reading)).toEqual(reading);
  });

  it('accepts a reading that knows nothing but the nutrients', () => {
    expect(
      issuesOf({
        ...reading,
        productName: null,
        brand: null,
        netQuantity: null,
        servingSize: null,
        perServing: [],
      }),
    ).toBeUndefined();
  });

  it('rejects a reading with neither per 100 g nor per serving values', () => {
    expect(issuesOf({ ...reading, per100g: [], perServing: [] })).toEqual([
      'per100g',
    ]);
  });

  it('rejects values only per serving without the serving size', () => {
    expect(issuesOf({ ...reading, per100g: [], servingSize: null })).toEqual([
      'servingSize',
    ]);
  });

  it('rejects a unit that does not measure the nutrient', () => {
    expect(
      issuesOf({ ...reading, per100g: [value('protein', '6', 'kcal')] }),
    ).toEqual(['per100g.0.unit']);
    expect(
      issuesOf({ ...reading, per100g: [value('energy_kcal', '6', 'g')] }),
    ).toEqual(['per100g.0.unit']);
  });

  it('rejects a confidence outside 0 to 1', () => {
    expect(
      issuesOf({ ...reading, brand: { value: 'Brand', confidence: 1.2 } }),
    ).toEqual(['brand.confidence']);
  });

  it('rejects a key that is not a nutrient', () => {
    expect(
      issuesOf({ ...reading, per100g: [value('energy' as never, '1', 'g')] }),
    ).toEqual(['per100g.0.nutrient']);
  });
});

describe('labelReadingToFood', () => {
  it('reads the product, its pack and its serving', () => {
    const food = labelReadingToFood(reading);

    expect(food).toMatchObject({
      name: 'Oat biscuits',
      brand: 'Brand',
      quantityLabel: '300 g',
      portions: [{ label: '1 biscuit', grams: 12.5 }],
      notes: [],
    });
    expect(food.confidence).toMatchObject({
      name: 0.95,
      brand: 0.8,
      quantityLabel: 0.7,
      portions: 0.6,
    });
  });

  it('takes the values per 100 g over those per serving', () => {
    expect(labelReadingToFood(reading).nutrients).toEqual({
      energy_kcal: 468,
      fat: 20,
      saturated_fat: 8.4,
      carbohydrate: 62,
      sugars: 21,
      protein: 6.5,
      sodium: 300,
    });
  });

  it('keeps the confidence of each value, sodium taking the salt’s', () => {
    expect(labelReadingToFood(reading).confidence.nutrients).toMatchObject({
      energy_kcal: 0.9,
      sugars: 0.4,
      sodium: 0.9,
    });
  });

  it('keeps what was printed for each value it read', () => {
    const food = labelReadingToFood(reading);

    expect(food.perServing).toBe(false);
    expect(food.printed).toMatchObject({
      energy_kcal: value('energy_kcal', '468', 'kcal'),
      saturated_fat: value('saturated_fat', '8,4', 'g'),
      sodium: value('salt', '0.75', 'g'),
    });
  });

  it('converts a label that prints only kJ', () => {
    const food = labelReadingToFood({
      ...reading,
      per100g: [value('energy_kj', '418.4', 'kJ', 0.5)],
    });

    expect(food.nutrients).toEqual({ energy_kcal: 100 });
    expect(food.confidence.nutrients).toEqual({ energy_kcal: 0.5 });
  });

  it('prefers kcal and sodium as printed over kJ and salt', () => {
    const food = labelReadingToFood({
      ...reading,
      per100g: [
        value('energy_kj', '1000', 'kJ', 0.2),
        value('salt', '5', 'g', 0.2),
        value('energy_kcal', '250', 'kcal', 0.7),
        value('sodium', '410', 'mg', 0.7),
      ],
    });

    expect(food.nutrients).toEqual({ energy_kcal: 250, sodium: 410 });
    expect(food.confidence.nutrients).toEqual({
      energy_kcal: 0.7,
      sodium: 0.7,
    });
  });

  it('scales a label that prints only per serving by the serving size', () => {
    const food = labelReadingToFood({
      ...reading,
      servingSize: { label: null, amount: 30, unit: 'g', confidence: 0.9 },
      per100g: [],
      perServing: [
        value('energy_kcal', '120', 'kcal'),
        value('protein', '3', 'g'),
        value('salt', '0.3', 'g'),
      ],
    });

    expect(food.nutrients).toEqual({
      energy_kcal: 400,
      protein: 10,
      sodium: 400,
    });
    expect(food.portions).toEqual([{ label: '30 g', grams: 30 }]);
    expect(food.perServing).toBe(true);
    expect(food.printed.protein).toEqual(value('protein', '3', 'g'));
  });

  it('weighs a serving in millilitres as grams', () => {
    const food = labelReadingToFood({
      ...reading,
      servingSize: { label: null, amount: 250, unit: 'ml', confidence: 0.9 },
      per100g: [],
      perServing: [value('sugars', '25', 'g')],
    });

    expect(food.nutrients).toMatchObject({ sugars: 10 });
    expect(food.portions).toEqual([{ label: '250 ml', grams: 250 }]);
  });

  it('converts each value to the unit of its nutrient', () => {
    const food = labelReadingToFood({
      ...reading,
      per100g: [
        value('energy_kcal', '836.8', 'kJ'),
        value('sodium', '0.4', 'g'),
        value('vitamin_d', '0.005', 'mg'),
        value('iron', '1400', 'µg'),
        value('protein', '500', 'mg'),
      ],
    });

    expect(food.nutrients).toEqual({
      energy_kcal: 200,
      sodium: 400,
      vitamin_d: 5,
      iron: 1.4,
      protein: 0.5,
    });
  });

  it('stores a trace as zero', () => {
    const food = labelReadingToFood({
      ...reading,
      per100g: [value('sugars', '<0.5', 'g'), value('fat', 'traces', 'g')],
    });

    expect(food.nutrients).toMatchObject({ sugars: 0, fat: 0 });
  });

  it('leaves out a value it cannot read, and its confidence', () => {
    const food = labelReadingToFood({
      ...reading,
      per100g: [value('protein', '?', 'g'), value('fat', '3', 'g')],
    });

    expect(food.nutrients).toEqual({ fat: 3, energy_kcal: 27 });
    expect(food.confidence.nutrients).not.toHaveProperty('protein');
  });

  it('takes the first value of a nutrient read twice', () => {
    const food = labelReadingToFood({
      ...reading,
      per100g: [
        value('energy_kcal', '100', 'kcal', 0.8),
        value('energy_kcal', '120', 'kcal', 0.3),
      ],
    });

    expect(food.nutrients).toEqual({ energy_kcal: 100 });
    expect(food.confidence.nutrients).toEqual({ energy_kcal: 0.8 });
  });

  it('fills missing energy from the macros, as sure as the least sure of them', () => {
    const food = labelReadingToFood({
      ...reading,
      per100g: [
        value('protein', '10', 'g', 0.9),
        value('carbohydrate', '20', 'g', 0.6),
        value('fat', '5', 'g', 0.8),
      ],
    });

    expect(food.nutrients.energy_kcal).toBe(165);
    expect(food.confidence.nutrients.energy_kcal).toBe(0.6);
    expect(food.printed).not.toHaveProperty('energy_kcal');
  });

  it('rounds each amount to two decimals', () => {
    const food = labelReadingToFood({
      ...reading,
      servingSize: { label: null, amount: 30, unit: 'g', confidence: 0.9 },
      per100g: [],
      perServing: [value('fibre', '1', 'g')],
    });

    expect(food.nutrients).toEqual({ fibre: 3.33 });
  });

  it('adds no portion for a serving the standard portions already cover', () => {
    const food = labelReadingToFood({
      ...reading,
      servingSize: { label: null, amount: 100, unit: 'g', confidence: 0.9 },
    });

    expect(food.portions).toEqual([]);
    expect(food.confidence.portions).toBeNull();
  });

  it('leaves out what the label does not show', () => {
    const food = labelReadingToFood({
      ...reading,
      productName: null,
      brand: null,
      netQuantity: null,
      servingSize: null,
      perServing: [],
      notes: ['The brand is cut off'],
    });

    expect(food).toMatchObject({
      name: null,
      brand: null,
      quantityLabel: null,
      portions: [],
      notes: ['The brand is cut off'],
    });
    expect(food.confidence).toMatchObject({
      name: null,
      brand: null,
      quantityLabel: null,
      portions: null,
    });
  });
});

describe('isUnsure', () => {
  it('is unsure of a reading below 0.8, and of nothing it did not read', () => {
    expect(isUnsure(0.79)).toBe(true);
    expect(isUnsure(0)).toBe(true);
    expect(isUnsure(0.8)).toBe(false);
    expect(isUnsure(1)).toBe(false);
    expect(isUnsure(null)).toBe(false);
    expect(isUnsure(undefined)).toBe(false);
  });
});
