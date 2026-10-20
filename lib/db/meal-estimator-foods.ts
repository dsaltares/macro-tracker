import type { Kysely } from 'kysely';
import type {
  MealEstimatorFood,
  MealEstimatorFoods,
} from '../ai/meal-estimator.ts';
import type {
  MatchedFood,
  MealEstimate,
  ResolvedMatches,
} from '../domain/diary/meal-estimate.ts';
import { nameMatchesEveryTerm } from '../domain/foods/search.ts';
import { findFood, searchFoods } from './food-search.ts';
import { findRecipeFood, isEmptyRecipe, listRecipes } from './recipes.ts';
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

type Reader = { db: Kysely<Database>; userId: string };

const liveFood = async (
  reader: Reader,
  id: string,
): Promise<MatchedFood | null> => {
  const food = await findFood(reader, id);
  return food === null || food.archived ? null : food;
};

const liveRecipe = async (
  { db, userId }: Reader,
  id: string,
): Promise<MatchedFood | null> => {
  const recipe = await findRecipeFood(db, userId, id);
  return recipe === null || recipe.archived || isEmptyRecipe(recipe)
    ? null
    : recipe;
};

const matchesById = async (
  ids: Iterable<string>,
  find: (id: string) => Promise<MatchedFood | null>,
) => {
  const matches = new Map<string, MatchedFood>();
  for (const id of new Set(ids)) {
    const match = await find(id);
    if (match !== null) {
      matches.set(id, match);
    }
  }
  return matches;
};

export const resolveMealMatches = async (
  reader: Reader,
  { items }: MealEstimate,
): Promise<ResolvedMatches> => ({
  foods: await matchesById(
    items.flatMap((item) => (item.kind === 'food' ? [item.foodId] : [])),
    (id) => liveFood(reader, id),
  ),
  recipes: await matchesById(
    items.flatMap((item) => (item.kind === 'recipe' ? [item.recipeId] : [])),
    (id) => liveRecipe(reader, id),
  ),
});
