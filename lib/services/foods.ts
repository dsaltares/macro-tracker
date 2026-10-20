import {
  type FoodReader,
  findFoodByBarcode as findFoodByBarcodeFor,
  findFood as findFoodFor,
  nutrientsByFood,
  searchFoods as searchFoodsFor,
} from '../db/food-search.ts';
import { createUserFood as createUserFoodFor } from '../db/user-foods.ts';
import type { UserFoodFields } from '../domain/foods/user-food.ts';
import type { Caller, ServiceContext } from './context.ts';

export type FoodReadContext = Pick<ServiceContext, 'db'> & {
  caller: Caller | null;
};

const readerOf = ({ db, caller }: FoodReadContext): FoodReader => ({
  db,
  userId: caller?.userId ?? null,
});

export const searchFoods = (
  context: FoodReadContext,
  input: { query: string; cursor: number },
) => searchFoodsFor(readerOf(context), input);

export const findFoodNutrients = (
  context: FoodReadContext,
  foodIds: readonly string[],
) => nutrientsByFood(readerOf(context), foodIds);

export const findFood = (context: FoodReadContext, id: string) =>
  findFoodFor(readerOf(context), id);

export const findFoodByBarcode = (context: FoodReadContext, code: string) =>
  findFoodByBarcodeFor(readerOf(context), code);

export const createUserFood = (context: ServiceContext, food: UserFoodFields) =>
  createUserFoodFor(context.db, context.caller.userId, food, context);
