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
import { apiError } from '../errors.ts';
import { apiHandler } from '../handler.ts';
import { cursorSchema, pageOf } from '../pagination.ts';

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

const found = (food: Food | null) => {
  if (food === null) {
    throw apiError('NOT_FOUND', 'There is no food with this id.');
  }
  return food;
};

const idParams = z.object({ id: z.string().min(1) });

export const searchFoodsRoute = apiHandler({
  scope: 'read',
  input: z.object({ q: z.string().max(maxQueryLength), cursor: cursorSchema }),
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
  scope: 'read',
  params: idParams,
  handle: async ({ context, params }) =>
    foodOf(found(await findFood(context, params.id))),
});

export const foodPortionsRoute = apiHandler({
  scope: 'read',
  params: idParams,
  handle: async ({ context, params }) =>
    pageOf(
      found(await findFood(context, params.id)).portions.map(portionOf),
      null,
    ),
});

export const foodByBarcodeRoute = apiHandler({
  scope: 'read',
  params: z.object({
    ean: z.string().transform((code, context) => {
      const barcode = normaliseBarcode(code);
      if (barcode === null) {
        context.addIssue({ code: 'custom', message: invalidBarcode });
        return z.NEVER;
      }
      return barcode;
    }),
  }),
  handle: async ({ context, params }) => {
    const food = await findFoodByBarcode(context, params.ean);
    if (food === null) {
      throw apiError('NOT_FOUND', 'There is no food with this barcode.');
    }
    return foodOf(food);
  },
});

const newFoodInput = userFoodSchema.extend({
  brand: userFoodSchema.shape.brand.default(null),
  barcode: userFoodSchema.shape.barcode.default(null),
  quantityLabel: userFoodSchema.shape.quantityLabel.default(null),
  portions: userFoodSchema.shape.portions.default([]),
});

export const createFoodRoute = apiHandler({
  scope: 'write',
  input: newFoodInput,
  status: 201,
  handle: async ({ context, input }) => {
    const created = await createUserFood(context, input);
    if (created.outcome !== 'saved') {
      throw apiError('CONFLICT', 'You already have a food with this barcode.');
    }
    return foodOf(found(await findFood(context, created.id)));
  },
});
