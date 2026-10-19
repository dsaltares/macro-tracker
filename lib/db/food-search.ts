import { type ExpressionBuilder, type Kysely, sql } from 'kysely';
import { normaliseBarcode } from '../domain/foods/barcode.ts';
import {
  defaultPortion,
  type Portion,
  withStandardPortions,
} from '../domain/foods/portions.ts';
import { matchExpression, searchPageSize } from '../domain/foods/search.ts';
import type { Source } from '../domain/foods/sources.ts';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import { nutrientsOf } from './foods.ts';
import type { Database } from './schema.ts';

export type FoodReader = {
  db: Kysely<Database>;
  userId: string | null;
};

export type FoodSummary = {
  id: string;
  name: string;
  brand: string | null;
  quantityLabel: string | null;
  source: Source;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  defaultPortion: Portion;
};

export type FoodSearchPage = {
  foods: FoodSummary[];
  nextCursor: number | null;
};

export type Food = {
  id: string;
  source: Source;
  barcode: string | null;
  name: string;
  brand: string | null;
  quantityLabel: string | null;
  archived: boolean;
  nutrients: NutrientVector;
  portions: Portion[];
};

const nameWeight = 4;
const brandWeight = 1;

const visibleFoods =
  (userId: string | null) =>
  ({ eb, or }: ExpressionBuilder<Database, 'foods'>) =>
    userId === null
      ? eb('foods.owner_user_id', 'is', null)
      : or([
          eb('foods.owner_user_id', 'is', null),
          eb('foods.owner_user_id', '=', userId),
        ]);

const visiblePortions =
  (userId: string | null) =>
  ({ eb, or }: ExpressionBuilder<Database, 'food_portions'>) =>
    userId === null
      ? eb('source', '=', 'upstream')
      : or([eb('source', '=', 'upstream'), eb('user_id', '=', userId)]);

export const portionsQuery = (
  db: Kysely<Database>,
  userId: string | null,
  foodIds: readonly string[],
) =>
  db
    .selectFrom('food_portions')
    .select(['food_id', 'label', 'grams'])
    .where('food_id', 'in', foodIds)
    .where(visiblePortions(userId))
    .orderBy('food_id')
    .orderBy('position')
    .orderBy('source');

const portionsByFood = async (
  { db, userId }: FoodReader,
  foodIds: readonly string[],
) => {
  const byFood = new Map<string, Portion[]>();
  if (foodIds.length === 0) {
    return byFood;
  }
  for (const { food_id, label, grams } of await portionsQuery(
    db,
    userId,
    foodIds,
  ).execute()) {
    byFood.set(food_id, [...(byFood.get(food_id) ?? []), { label, grams }]);
  }
  return byFood;
};

export const searchQuery = (
  db: Kysely<Database>,
  userId: string | null,
  match: string,
  offset: number,
) => {
  let query = db
    .selectFrom('foods_fts')
    .innerJoin('foods', 'foods.rowid', 'foods_fts.rowid')
    .innerJoin('food_nutrients', 'food_nutrients.food_id', 'foods.id')
    .select([
      'foods.id',
      'foods.name',
      'foods.brand',
      'foods.quantity_label',
      'foods.source',
      'food_nutrients.energy_kcal',
      'food_nutrients.protein',
      'food_nutrients.carbohydrate',
      'food_nutrients.fat',
    ])
    .where(sql<boolean>`foods_fts match ${match}`)
    .where('foods.archived_at', 'is', null)
    .where(visibleFoods(userId));
  if (userId !== null) {
    query = query.where('foods.source', 'not in', (eb) =>
      eb
        .selectFrom('food_source_preferences')
        .select('food_source_preferences.source')
        .where('food_source_preferences.user_id', '=', userId)
        .where('food_source_preferences.enabled', '=', 0),
    );
  }
  return query
    .orderBy(sql`foods.owner_user_id is null`)
    .orderBy(sql`bm25(foods_fts, ${nameWeight}, ${brandWeight})`)
    .orderBy('foods.rowid')
    .limit(searchPageSize + 1)
    .offset(offset);
};

export const searchFoods = async (
  reader: FoodReader,
  { query, cursor }: { query: string; cursor: number },
): Promise<FoodSearchPage> => {
  const match = matchExpression(query);
  if (match === null) {
    return { foods: [], nextCursor: null };
  }
  const rows = await searchQuery(
    reader.db,
    reader.userId,
    match,
    cursor,
  ).execute();
  const page = rows.slice(0, searchPageSize);
  const portions = await portionsByFood(
    reader,
    page.map(({ id }) => id),
  );
  return {
    foods: page.map((row) => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      quantityLabel: row.quantity_label,
      source: row.source,
      energyKcal: row.energy_kcal,
      protein: row.protein,
      carbohydrate: row.carbohydrate,
      fat: row.fat,
      defaultPortion: defaultPortion(portions.get(row.id) ?? []),
    })),
    nextCursor: rows.length > searchPageSize ? cursor + searchPageSize : null,
  };
};

const foodColumns = [
  'foods.id',
  'foods.source',
  'foods.barcode',
  'foods.name',
  'foods.brand',
  'foods.quantity_label',
  'foods.archived_at',
] as const;

export const foodByIdQuery = (
  db: Kysely<Database>,
  userId: string | null,
  id: string,
) =>
  db
    .selectFrom('foods')
    .select(foodColumns)
    .where('foods.id', '=', id)
    .where(visibleFoods(userId));

export const foodByBarcodeQuery = (
  db: Kysely<Database>,
  userId: string | null,
  barcode: string,
) =>
  db
    .selectFrom('foods')
    .select(foodColumns)
    .where('foods.barcode', '=', barcode)
    .where(({ eb, and, or }) =>
      userId === null
        ? and([
            eb('foods.owner_user_id', 'is', null),
            eb('foods.archived_at', 'is', null),
          ])
        : or([
            eb('foods.owner_user_id', '=', userId),
            and([
              eb('foods.owner_user_id', 'is', null),
              eb('foods.archived_at', 'is', null),
            ]),
          ]),
    )
    .orderBy(sql`foods.owner_user_id is null`)
    .orderBy('foods.rowid', 'desc')
    .limit(1);

type FoodRow = {
  id: string;
  source: Source;
  barcode: string | null;
  name: string;
  brand: string | null;
  quantity_label: string | null;
  archived_at: string | null;
};

const fullFood = async (reader: FoodReader, row: FoodRow): Promise<Food> => {
  const [nutrients, portions] = await Promise.all([
    nutrientsOf(reader.db, row.id),
    portionsByFood(reader, [row.id]),
  ]);
  return {
    id: row.id,
    source: row.source,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    quantityLabel: row.quantity_label,
    archived: row.archived_at !== null,
    nutrients: nutrients ?? {},
    portions: withStandardPortions(portions.get(row.id) ?? []),
  };
};

export const findFood = async (
  reader: FoodReader,
  id: string,
): Promise<Food | null> => {
  const row = await foodByIdQuery(
    reader.db,
    reader.userId,
    id,
  ).executeTakeFirst();
  return row ? fullFood(reader, row) : null;
};

export const findFoodByBarcode = async (
  reader: FoodReader,
  code: string,
): Promise<Food | null> => {
  const barcode = normaliseBarcode(code);
  if (barcode === null) {
    return null;
  }
  const row = await foodByBarcodeQuery(
    reader.db,
    reader.userId,
    barcode,
  ).executeTakeFirst();
  return row ? fullFood(reader, row) : null;
};
