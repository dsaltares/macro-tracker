import { describe, expect, it } from 'vitest';
import {
  type CronometerFood,
  type CronometerServing,
  cronometerFoodSchema,
  cronometerNutrients,
  diaryEntrySchema,
  foodNutrientsPer100g,
  isQuickAdd,
  mealGroupOf,
  mealOf,
  portionsOf,
  productNameOf,
  referenceIdOf,
  servingGrams,
  servingOf,
  timeOf,
  userFoodOf,
} from './cronometer.ts';

const food = (overrides: Partial<CronometerFood> = {}): CronometerFood => ({
  id: 1,
  defaultMeasureId: null,
  name: 'Chia Seeds',
  source: 'NCCDB:113383',
  measures: [
    {
      id: null,
      name: 'tbsp, whole pieces',
      value: 10,
      type: 'Weight',
      hidden: false,
    },
    { id: null, name: 'g', value: 1, type: 'Weight', hidden: false },
  ],
  nutrients: [
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
  measures: [
    { id: null, name: 'g', value: 270, type: 'Recipe', hidden: false },
    { id: null, name: 'full recipe', value: 1, type: 'Recipe', hidden: false },
    { id: null, name: 'full recipe', value: 1, type: 'Recipe', hidden: false },
  ],
  nutrients: [
    { id: 208, amount: 259.1 },
    { id: 203, amount: 27 },
  ],
});

const serving = (
  overrides: Partial<CronometerServing> = {},
): CronometerServing => ({
  servingId: '1',
  day: '2026-09-01',
  time: null,
  mealGroup: 'breakfast',
  foodId: 1,
  measureName: 'g',
  quantityGrams: 20,
  nutrients: [],
  ...overrides,
});

describe('cronometerNutrients', () => {
  it('reads Cronometer nutrient ids as USDA numbers, fibre out of carbohydrate', () => {
    expect(cronometerNutrients(food().nutrients)).toEqual({
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
        serving({ measureName: 'full recipe', quantityGrams: 1.5 }),
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
      measures: [
        { id: null, name: 'serving', value: 1, type: 'Recipe', hidden: false },
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
      measures: [
        { id: null, name: 'cup', value: 160, type: 'Weight', hidden: false },
        { id: null, name: 'Gallon', value: 1147, type: 'Volume', hidden: true },
        { id: null, name: 'cup', value: 150, type: 'Weight', hidden: false },
        { id: null, name: '100 g', value: 100, type: 'Weight', hidden: false },
        { id: null, name: 'g', value: 1, type: 'Weight', hidden: false },
        { id: null, name: '  ', value: 3, type: 'Weight', hidden: false },
        { id: null, name: 'none', value: 0, type: 'Weight', hidden: false },
        {
          id: null,
          name: 'x'.repeat(61),
          value: 3,
          type: 'Weight',
          hidden: false,
        },
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
      nutrients: cronometerNutrients(food().nutrients),
      portions: [{ label: 'tbsp, whole pieces', grams: 10 }],
    });
  });

  it('is null for amounts no food holds per 100 g', () => {
    expect(
      userFoodOf(food({ nutrients: [{ id: 255, amount: 330 }] })),
    ).toBeNull();
  });
});

describe('servingGrams', () => {
  it('is the grams Cronometer logged for a food', () => {
    expect(servingGrams(serving({ quantityGrams: 20 }), food())).toBe(20);
    expect(servingGrams(serving({ quantityGrams: null }), food())).toBeNull();
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

  it('keeps the hour and minute of a time, padded', () => {
    expect(timeOf('08:30:00')).toBe('08:30');
    expect(timeOf('8:5:0')).toBe('08:05');
    expect(timeOf('25:00')).toBeNull();
    expect(timeOf('later')).toBeNull();
    expect(timeOf(null)).toBeNull();
  });

  it('reads the meal from the high bits of the order', () => {
    expect(mealGroupOf((1 << 16) | 3)).toBe('breakfast');
    expect(mealGroupOf(4 << 16)).toBe('snacks');
    expect(mealGroupOf(7)).toBe('uncategorized');
    expect(mealGroupOf(null)).toBe('uncategorized');
  });
});

describe('servingOf', () => {
  const entry = diaryEntrySchema.parse({
    type: 'Serving',
    time: '8:05:00',
    foodId: 1,
    measureId: 11,
    grams: 20,
    servingId: 501,
    order: 2 << 16,
  });

  it("scales the food's amounts per 100 g to the grams logged", () => {
    const chia = food({
      measures: [
        { id: 11, name: 'tbsp', value: 10, type: 'Weight', hidden: false },
      ],
    });

    expect(servingOf('2026-09-01', entry, 0, chia)).toEqual({
      servingId: '501',
      day: '2026-09-01',
      time: '8:05:00',
      mealGroup: 'lunch',
      foodId: 1,
      measureName: 'tbsp',
      quantityGrams: 20,
      nutrients: [
        { id: 208, amount: 97.2 },
        { id: 203, amount: 3.3 },
        { id: 205, amount: 8.42 },
        { id: 291, amount: 6.88 },
        { id: 204, amount: 6.14 },
        { id: 301, amount: 126.2 },
      ],
    });
  });

  it('scales a recipe by its servings, falling back to its default measure', () => {
    const recipe = food({
      defaultMeasureId: 12,
      measures: [
        {
          id: 12,
          name: 'full recipe',
          value: 1,
          type: 'Recipe',
          hidden: false,
        },
      ],
      nutrients: [{ id: 208, amount: 259.1 }],
    });

    expect(
      servingOf('2026-09-01', { ...entry, grams: 2 }, 0, recipe),
    ).toMatchObject({
      measureName: 'full recipe',
      nutrients: [{ id: 208, amount: 518.2 }],
    });
  });

  it('has no amounts without its food, and an id of its own without one', () => {
    expect(
      servingOf('2026-09-01', { ...entry, servingId: null }, 3, undefined),
    ).toMatchObject({
      servingId: '2026-09-01-3',
      measureName: null,
      nutrients: [],
    });
  });
});

describe('API answers', () => {
  it('reads a food, filling what it leaves out', () => {
    expect(
      cronometerFoodSchema.parse({
        id: 1,
        name: 'Honey',
        measures: null,
        nutrients: [{ id: 208, amount: 304 }],
        translations: [],
      }),
    ).toEqual({
      id: 1,
      name: 'Honey',
      source: null,
      defaultMeasureId: null,
      measures: [],
      nutrients: [{ id: 208, amount: 304 }],
    });
  });
});
