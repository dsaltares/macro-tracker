import type { Food } from '../../db/food-search.ts';
import type { ReferenceSource } from '../../domain/foods/sources.ts';
import type { UserFoodFields } from '../../domain/foods/user-food.ts';
import { listMeasurements, logMeasurement } from '../../services/body.ts';
import type { ServiceContext } from '../../services/context.ts';
import { findDiaryDay } from '../../services/diary.ts';
import {
  createUserFood,
  findFood,
  findFoodBySourceId,
  findFoodNutrients,
  searchFoods,
} from '../../services/foods.ts';
import { logMeal, type MealToLog } from '../../services/meal.ts';
import type { Candidate } from './match.ts';

export type AccountFood = Candidate & {
  portions: { label: string; grams: number }[];
};

export type Account = {
  foodBySourceId: (
    source: ReferenceSource,
    sourceId: string,
  ) => Promise<AccountFood | null>;
  searchFoods: (query: string) => Promise<Candidate[]>;
  food: (id: string) => Promise<AccountFood>;
  createFood: (food: UserFoodFields) => Promise<AccountFood>;
  hasEntriesOn: (date: string) => Promise<boolean>;
  weightDates: (range: { from: string; to: string }) => Promise<Set<string>>;
  logMeal: (meal: MealToLog) => Promise<void>;
  logWeight: (date: string, kilograms: number) => Promise<void>;
};

const accountFoodOf = (food: Food): AccountFood => ({
  id: food.id,
  source: food.source,
  name: food.name,
  brand: food.brand,
  nutrients: food.nutrients,
  portions: food.portions.map(({ label, grams }) => ({ label, grams })),
});

export const accountOf = (context: ServiceContext): Account => {
  const food = async (id: string) => {
    const found = await findFood(context, id);
    if (found === null) {
      throw new Error(`Food ${id} is not one you can log`);
    }
    return accountFoodOf(found);
  };

  return {
    foodBySourceId: async (source, sourceId) => {
      const found = await findFoodBySourceId(context, source, sourceId);
      return found === null ? null : accountFoodOf(found);
    },
    searchFoods: async (query) => {
      const { foods } = await searchFoods(context, { query, cursor: 0 });
      const nutrients = await findFoodNutrients(
        context,
        foods.map(({ id }) => id),
      );
      return foods.map(({ id, source, name, brand }) => ({
        id,
        source,
        name,
        brand,
        nutrients: nutrients.get(id) ?? {},
      }));
    },
    food,
    createFood: async (fields) => {
      const written = await createUserFood(context, fields);
      if (written.outcome !== 'saved') {
        throw new Error(
          `${fields.name} could not be saved: ${written.outcome}`,
        );
      }
      return food(written.id);
    },
    hasEntriesOn: async (date) =>
      (await findDiaryDay(context, date)).meals.some(
        ({ entries }) => entries.length > 0,
      ),
    weightDates: async ({ from, to }) =>
      new Set(
        (
          await listMeasurements(context, { metric: 'weight_kg', from, to })
        ).map(({ date }) => date),
      ),
    logMeal: async (meal) => {
      const logged = await logMeal(context, meal);
      if (logged.outcome !== 'logged') {
        throw new Error(
          `Item ${logged.index + 1} could not be logged: ${logged.outcome}`,
        );
      }
    },
    logWeight: async (date, kilograms) => {
      await logMeasurement(context, {
        date,
        metric: 'weight_kg',
        value: kilograms,
      });
    },
  };
};
