import { z } from 'zod';
import type { Food, StoredPortion } from '../../db/food-search.ts';
import { normaliseBarcode } from '../../domain/foods/barcode.ts';
import type { Portion } from '../../domain/foods/portions.ts';
import {
  invalidBarcode,
  userFoodSchema,
} from '../../domain/foods/user-food.ts';
import {
  type NutrientKey,
  nutrientKeys,
} from '../../domain/nutrition/nutrients.ts';
import type { NutrientVector } from '../../domain/nutrition/vector.ts';
import {
  createUserFood,
  findFood,
  findFoodByBarcode,
  findFoodNutrients,
  searchFoods,
} from '../../services/foods.ts';
import { apiFailure } from '../errors.ts';
import { apiHandler } from '../handler.ts';
import { cursorSchema, pageOf } from '../pagination.ts';
import {
  food as foodSchema,
  foodSummary,
  idSchema,
  page,
  portion as portionSchema,
} from '../schemas.ts';

const maxQueryLength = 200;

export const canonicalNutrients = (
  vector: NutrientVector,
): Record<NutrientKey, number | null> =>
  Object.fromEntries(
    nutrientKeys.map((key) => [key, vector[key] ?? null]),
  ) as Record<NutrientKey, number | null>;

const portionOf = (portion: StoredPortion | Portion) =>
  'id' in portion
    ? {
        id: portion.id,
        label: portion.label,
        grams: portion.grams,
        source: portion.source,
      }
    : {
        id: null,
        label: portion.label,
        grams: portion.grams,
        source: 'standard' as const,
      };

const foodOf = (food: Food) => ({
  id: food.id,
  source: food.source,
  barcode: food.barcode,
  name: food.name,
  brand: food.brand,
  quantityLabel: food.quantityLabel,
  archived: food.archived,
  nutrients: canonicalNutrients(food.nutrients),
  portions: food.portions.map(portionOf),
});

const foodNotFound = apiFailure('NOT_FOUND', 'There is no food with this id.');

const barcodeNotFound = apiFailure(
  'NOT_FOUND',
  'There is no food with this barcode.',
);

const barcodeTaken = apiFailure(
  'CONFLICT',
  'You already have a food with this barcode.',
);

const found = (food: Food | null) => {
  if (food === null) {
    throw foodNotFound();
  }
  return food;
};

const idParams = z.object({
  id: idSchema.describe('The food id, as search or the diary returned it.'),
});

const exampleFoodId = '7d1f4c2e-9b3a-4f6e-8c5d-2a1b0c9d8e7f';

const oatsPer100g = {
  energy_kcal: 379,
  protein: 11.7,
  carbohydrate: 60.4,
  fat: 7.6,
  fibre: 9.1,
  saturated_fat: 1.3,
  sugars: 1.1,
  sodium: 4,
};

const exampleFood = {
  id: exampleFoodId,
  source: 'off' as const,
  barcode: '5010029000016',
  name: 'Porridge oats',
  brand: "Flahavan's",
  quantityLabel: '1 kg',
  archived: false,
  nutrients: canonicalNutrients(oatsPer100g),
  portions: [
    {
      id: 'c2a8e4b6-1d3f-4a5b-9e7c-6f8d0a2b4c6e',
      label: '1 serving (40 g)',
      grams: 40,
      source: 'upstream' as const,
    },
    { id: null, label: '100 g', grams: 100, source: 'standard' as const },
    { id: null, label: '1 g', grams: 1, source: 'standard' as const },
    { id: null, label: '1 ml', grams: 1, source: 'standard' as const },
  ],
};

export const searchFoodsRoute = apiHandler({
  method: 'GET',
  path: '/foods',
  operationId: 'searchFoods',
  summary: 'Search foods',
  description:
    "Full-text search over the reference foods and the caller's own foods, the caller's own first. Each food comes with its nutrients per 100 g and the portion to offer first; GET /foods/{id} has every portion. Pages of 30.",
  scope: 'read',
  input: z.object({
    q: z
      .string()
      .max(maxQueryLength)
      .describe('Words of the name or brand, in any order.'),
    cursor: cursorSchema.describe(
      'The nextCursor of the previous page; leave out for the first page.',
    ),
  }),
  output: page(foodSummary),
  example: {
    input: { q: 'porridge oats' },
    response: {
      items: [
        {
          id: exampleFoodId,
          source: 'off',
          name: 'Porridge oats',
          brand: "Flahavan's",
          quantityLabel: '1 kg',
          defaultPortion: { label: '1 serving (40 g)', grams: 40 },
          nutrients: canonicalNutrients(oatsPer100g),
        },
      ],
      nextCursor: null,
    },
  },
  handle: async ({ context, input }) => {
    const { foods, nextCursor } = await searchFoods(context, {
      query: input.q,
      cursor: input.cursor,
    });
    const nutrients = await findFoodNutrients(
      context,
      foods.map(({ id }) => id),
    );
    return pageOf(
      foods.map((food) => ({
        id: food.id,
        source: food.source,
        name: food.name,
        brand: food.brand,
        quantityLabel: food.quantityLabel,
        defaultPortion: food.defaultPortion,
        nutrients: canonicalNutrients(nutrients.get(food.id) ?? {}),
      })),
      nextCursor,
    );
  },
});

export const foodRoute = apiHandler({
  method: 'GET',
  path: '/foods/{id}',
  operationId: 'getFood',
  summary: 'Get a food',
  description:
    "A reference food, or one of the caller's own, with every canonical nutrient per 100 g and every portion it can be logged in.",
  scope: 'read',
  params: idParams,
  output: foodSchema,
  errors: [foodNotFound],
  example: { params: { id: exampleFoodId }, response: exampleFood },
  handle: async ({ context, params }) =>
    foodOf(found(await findFood(context, params.id))),
});

export const foodPortionsRoute = apiHandler({
  method: 'GET',
  path: '/foods/{id}/portions',
  operationId: 'listFoodPortions',
  summary: 'List the portions of a food',
  description:
    "The portions a food can be logged in: the ones its source declares, the caller's own, and the standard 100 g, 1 g and 1 ml. One page, never more.",
  scope: 'read',
  params: idParams,
  output: page(portionSchema),
  errors: [foodNotFound],
  example: {
    params: { id: exampleFoodId },
    response: { items: exampleFood.portions, nextCursor: null },
  },
  handle: async ({ context, params }) =>
    pageOf(
      found(await findFood(context, params.id)).portions.map(portionOf),
      null,
    ),
});

export const foodByBarcodeRoute = apiHandler({
  method: 'GET',
  path: '/foods/barcode/{ean}',
  operationId: 'getFoodByBarcode',
  summary: 'Find a food by barcode',
  description:
    'The food with this barcode: an EAN-8, EAN-13 or UPC-A, which is read as the EAN-13 it is. Anything else is 400.',
  scope: 'read',
  params: z.object({
    ean: z
      .string()
      .transform((code, context) => {
        const barcode = normaliseBarcode(code);
        if (barcode === null) {
          context.addIssue({ code: 'custom', message: invalidBarcode });
          return z.NEVER;
        }
        return barcode;
      })
      .describe('The digits of the barcode, as printed.'),
  }),
  output: foodSchema,
  errors: [barcodeNotFound],
  example: { params: { ean: '5010029000016' }, response: exampleFood },
  handle: async ({ context, params }) => {
    const food = await findFoodByBarcode(context, params.ean);
    if (food === null) {
      throw barcodeNotFound();
    }
    return foodOf(food);
  },
});

const newFoodInput = userFoodSchema.extend({
  name: userFoodSchema.shape.name.describe('What the food is called.'),
  brand: userFoodSchema.shape.brand.default(null),
  barcode: userFoodSchema.shape.barcode
    .default(null)
    .describe('An EAN-8, EAN-13 or UPC-A, or null.'),
  quantityLabel: userFoodSchema.shape.quantityLabel
    .default(null)
    .describe('The pack size as printed, such as "500 g".'),
  nutrients: userFoodSchema.shape.nutrients.describe(
    "Amounts per 100 g by canonical nutrient key, in each nutrient's unit. Leave out what the label does not say.",
  ),
  portions: userFoodSchema.shape.portions
    .default([])
    .describe('Portions to log the food in, each a label and its grams.'),
});

export const createFoodRoute = apiHandler({
  method: 'POST',
  path: '/foods',
  operationId: 'createFood',
  summary: 'Create a food',
  description:
    "A food of the caller's own, with its nutrients per 100 g, that search finds from then on. 100 g, 1 g and 1 ml are always portions, so only name the others.",
  scope: 'write',
  input: newFoodInput,
  output: foodSchema,
  status: 201,
  errors: [barcodeTaken],
  example: {
    input: {
      name: 'Homemade granola',
      brand: null,
      barcode: null,
      quantityLabel: null,
      nutrients: {
        energy_kcal: 450,
        protein: 11,
        carbohydrate: 60,
        fat: 18,
        fibre: 7,
        sugars: 15,
      },
      portions: [{ label: '1 bowl', grams: 45 }],
    },
    response: {
      id: 'a4e2c6d8-0b1f-4e3a-9d5c-7f8e6a4b2c1d',
      source: 'user',
      barcode: null,
      name: 'Homemade granola',
      brand: null,
      quantityLabel: null,
      archived: false,
      nutrients: canonicalNutrients({
        energy_kcal: 450,
        protein: 11,
        carbohydrate: 60,
        fat: 18,
        fibre: 7,
        sugars: 15,
      }),
      portions: [
        {
          id: 'e6f8a0b2-3c4d-4e5f-8a9b-1c2d3e4f5a6b',
          label: '1 bowl',
          grams: 45,
          source: 'user',
        },
        { id: null, label: '100 g', grams: 100, source: 'standard' },
        { id: null, label: '1 g', grams: 1, source: 'standard' },
        { id: null, label: '1 ml', grams: 1, source: 'standard' },
      ],
    },
  },
  handle: async ({ context, input }) => {
    const created = await createUserFood(context, input);
    if (created.outcome !== 'saved') {
      throw barcodeTaken();
    }
    return foodOf(found(await findFood(context, created.id)));
  },
});
