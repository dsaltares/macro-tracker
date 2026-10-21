import { describe, expect, it } from 'vitest';
import {
  type CronometerFood,
  type CronometerServing,
  cronometerFoodSchema,
  cronometerNutrients,
  cronometerServingSchema,
  foodNutrientsPer100g,
  isQuickAdd,
  mealOf,
  portionsOf,
  productNameOf,
  referenceIdOf,
  servingGrams,
  timeOf,
  userFoodOf,
} from './cronometer.ts';

const food = (overrides: Partial<CronometerFood> = {}): CronometerFood => ({
  food_id: 1,
  name: 'Chia Seeds',
  source: 'NCCDB:113383',
  measures_json: [
    { name: 'tbsp, whole pieces', value: 10, type: 'Weight', hidden: false },
    { name: 'g', value: 1, type: 'Weight', hidden: false },
  ],
  nutrients_json: [
    { id: 208, amount: 486 },
    { id: 203, amount: 16.5 },
    { id: 205, amount: 42.1 },
    { id: 291, amount: 34.4 },
    { id: 204, amount: 30.7 },
    { id: 301, amount: 631 },
  ],
  ...overrides,
});

const scrambledEggs = food({
  name: 'Scrambled eggs+whites',
  source: 'Custom',
  measures_json: [
    { name: 'g', value: 270, type: 'Recipe', hidden: false },
    { name: 'full recipe', value: 1, type: 'Recipe', hidden: false },
    { name: 'full recipe', value: 1, type: 'Recipe', hidden: false },
  ],
  nutrients_json: [
    { id: 208, amount: 259.1 },
    { id: 203, amount: 27 },
  ],
});

const serving = (
  overrides: Partial<CronometerServing> = {},
): CronometerServing => ({
  serving_id: '1',
  day: '2026-09-01',
  time: null,
  meal_group: 'breakfast',
  food_id: 1,
  measure_name: 'g',
  quantity_grams: 20,
  energy_kcal: 97.2,
  nutrients_json: [],
  ...overrides,
});

describe('cronometerNutrients', () => {
  it('reads Cronometer nutrient ids as USDA numbers, fibre out of carbohydrate', () => {
    expect(cronometerNutrients(food().nutrients_json)).toEqual({
      energy_kcal: 486,
      protein: 16.5,
      carbohydrate: 42.1 - 34.4,
      fibre: 34.4,
      fat: 30.7,
      calcium: 631,
    });
  });

  it('ignores the ids it does not know and the missing amounts', () => {
    expect(
      cronometerNutrients([
        { id: -1205, amount: 7.7 },
        { id: 10001, amount: 1 },
        { id: 203, amount: null },
        { id: null, amount: 3 },
      ]),
    ).toEqual({});
  });
});

describe('referenceIdOf', () => {
  it('reads a USDA SR Legacy food as its NDB number', () => {
    expect(referenceIdOf('USDAsr:01009')).toEqual({
      source: 'usda',
      sourceId: 'ndb:1009',
    });
  });

  it('reads a CoFID food as its code', () => {
    expect(referenceIdOf('CoFID:13-246')).toEqual({
      source: 'cofid',
      sourceId: '13-246',
    });
  });

  it('is null for a source this app does not import', () => {
    expect(referenceIdOf('NCCDB:1169')).toBeNull();
    expect(referenceIdOf('CRDB')).toBeNull();
    expect(referenceIdOf(null)).toBeNull();
  });
});

describe('a recipe', () => {
  it('is per 100 g over the weight its g measure gives', () => {
    expect(foodNutrientsPer100g(scrambledEggs)).toEqual({
      energy_kcal: expect.closeTo(95.963, 3),
      protein: 10,
    });
  });

  it('weighs its servings by that weight', () => {
    expect(
      servingGrams(
        serving({ measure_name: 'full recipe', quantity_grams: 1.5 }),
        scrambledEggs,
      ),
    ).toBe(405);
  });

  it('has its recipe measures as portions of that weight', () => {
    expect(portionsOf(scrambledEggs)).toEqual([
      { label: 'full recipe', grams: 270 },
    ]);
  });

  it('has no amounts per 100 g without a g measure', () => {
    const unweighed = food({
      measures_json: [
        { name: 'serving', value: 1, type: 'Recipe', hidden: false },
      ],
    });

    expect(foodNutrientsPer100g(unweighed)).toBeNull();
    expect(servingGrams(serving(), unweighed)).toBeNull();
    expect(userFoodOf(unweighed)).toBeNull();
  });
});

describe('portionsOf', () => {
  it('keeps the visible measures with their grams, leaving out 1 g and duplicates', () => {
    const measured = food({
      measures_json: [
        { name: 'cup', value: 160, type: 'Weight', hidden: false },
        { name: 'Gallon', value: 1147, type: 'Volume', hidden: true },
        { name: 'cup', value: 150, type: 'Weight', hidden: false },
        { name: '100 g', value: 100, type: 'Weight', hidden: false },
        { name: 'g', value: 1, type: 'Weight', hidden: false },
        { name: '  ', value: 3, type: 'Weight', hidden: false },
        { name: 'none', value: 0, type: 'Weight', hidden: false },
        { name: 'x'.repeat(61), value: 3, type: 'Weight', hidden: false },
      ],
    });

    expect(portionsOf(measured)).toEqual([{ label: 'cup', grams: 160 }]);
  });
});

describe('userFoodOf', () => {
  it('is the food per 100 g with its portions', () => {
    expect(userFoodOf(food())).toEqual({
      name: 'Chia Seeds',
      brand: null,
      barcode: null,
      quantityLabel: null,
      nutrients: cronometerNutrients(food().nutrients_json),
      portions: [{ label: 'tbsp, whole pieces', grams: 10 }],
    });
  });

  it('is null for amounts no food holds per 100 g', () => {
    expect(
      userFoodOf(food({ nutrients_json: [{ id: 255, amount: 330 }] })),
    ).toBeNull();
  });
});

describe('servingGrams', () => {
  it('is the grams Cronometer logged for a food', () => {
    expect(servingGrams(serving({ quantity_grams: 20 }), food())).toBe(20);
    expect(servingGrams(serving({ quantity_grams: null }), food())).toBeNull();
  });
});

describe('names', () => {
  it('takes the brand off a branded food', () => {
    expect(
      productNameOf(
        food({ name: 'Hacendado, Salmorejo Fresco', source: 'CRDB' }),
      ),
    ).toBe('Salmorejo Fresco');
    expect(productNameOf(food({ name: 'Honey', source: 'CRDB' }))).toBe(
      'Honey',
    );
    expect(productNameOf(food({ name: 'Cod, Atlantic, Cooked' }))).toBe(
      'Cod, Atlantic, Cooked',
    );
  });

  it('knows a Cronometer quick add', () => {
    expect(isQuickAdd(food({ name: 'Quick Add, Carbohydrate' }))).toBe(true);
    expect(isQuickAdd(food({ name: 'Quicksilver' }))).toBe(false);
  });
});

describe('meals and times', () => {
  it('logs snacks and the uncategorised to snack', () => {
    expect(mealOf('breakfast')).toBe('breakfast');
    expect(mealOf('snacks')).toBe('snack');
    expect(mealOf('uncategorized')).toBe('snack');
  });

  it('keeps the hour and minute of a time', () => {
    expect(timeOf('08:30:00')).toBe('08:30');
    expect(timeOf('later')).toBeNull();
    expect(timeOf(null)).toBeNull();
  });
});

describe('rows', () => {
  it('parses the JSON columns of a row', () => {
    expect(
      cronometerFoodSchema.parse({
        food_id: 1,
        name: 'Honey',
        source: null,
        measures_json: null,
        nutrients_json: '[{"id":208,"amount":304}]',
      }),
    ).toMatchObject({
      measures_json: [],
      nutrients_json: [{ id: 208, amount: 304 }],
    });
    expect(
      cronometerServingSchema.parse({ ...serving(), nutrients_json: '[]' }),
    ).toMatchObject({ nutrients_json: [] });
  });
});
