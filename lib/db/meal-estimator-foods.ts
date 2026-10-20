import type { Kysely } from 'kysely';
import type {
  MealEstimatorFood,
  MealEstimatorFoods,
} from '../ai/meal-estimator.ts';
import { nameMatchesEveryTerm } from '../domain/foods/search.ts';
import { findFood, searchFoods } from './food-search.ts';
import { listRecipes } from './recipes.ts';
import type { Database } from './schema.ts';

const firstPage = 0;

export const mealEstimatorFoods = ({
  db,
  userId,
}: {
  db: Kysely<Database>;
  userId: string;
}): MealEstimatorFoods => ({
  searchFoods: async (query) => {
    const [{ foods }, recipes] = await Promise.all([
      searchFoods({ db, userId }, { query, cursor: firstPage }),
      listRecipes(db, userId),
    ]);
    return {
      foods,
      recipes: recipes.filter(({ name }) => nameMatchesEveryTerm(name, query)),
    };
  },
  getFood: async (id): Promise<MealEstimatorFood | null> => {
    const food = await findFood({ db, userId }, id);
    if (food === null || food.archived) {
      return null;
    }
    return {
      id: food.id,
      name: food.name,
      brand: food.brand,
      quantityLabel: food.quantityLabel,
      source: food.source,
      portions: food.portions.map(({ label, grams }) => ({ label, grams })),
    };
  },
});
