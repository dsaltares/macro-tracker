import type { Kysely, Selectable } from 'kysely';
import { type Meal, meals } from '../domain/diary/entries.ts';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import { foodByIdQuery } from './food-search.ts';
import type { FoodWriteContext } from './foods.ts';
import type { Database, DiaryEntriesTable } from './schema.ts';

type EntryFields = {
  date: string;
  meal: Meal;
  time: string | null;
  label: string;
  nutrients: NutrientVector;
};

type Amount = {
  quantity: number;
  portionLabel: string;
  grams: number;
};

export type FoodEntryInput = EntryFields &
  Amount & { kind: 'food'; foodId: string };

export type RecipeEntryInput = EntryFields &
  Amount & { kind: 'recipe'; recipeId: string };

export type QuickEntryInput = EntryFields & { kind: 'quick' };

export type DiaryEntryInput =
  | FoodEntryInput
  | RecipeEntryInput
  | QuickEntryInput;

export type DiaryEntry = EntryFields & {
  id: string;
  kind: DiaryEntryInput['kind'];
  foodId: string | null;
  recipeId: string | null;
  quantity: number | null;
  portionLabel: string | null;
  grams: number | null;
  createdAt: string;
  updatedAt: string;
};

const amountOf = (input: DiaryEntryInput) =>
  input.kind === 'quick'
    ? { quantity: null, portion_label: null, grams: null }
    : {
        quantity: input.quantity,
        portion_label: input.portionLabel,
        grams: input.grams,
      };

const diaryEntry = (row: Selectable<DiaryEntriesTable>): DiaryEntry => ({
  id: row.id,
  date: row.date,
  meal: row.meal,
  time: row.time,
  kind: row.kind,
  foodId: row.food_id,
  recipeId: row.recipe_id,
  label: row.label,
  quantity: row.quantity,
  portionLabel: row.portion_label,
  grams: row.grams,
  nutrients: JSON.parse(row.nutrients) as NutrientVector,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const inDayOrder = (a: DiaryEntry, b: DiaryEntry) =>
  meals.indexOf(a.meal) - meals.indexOf(b.meal) ||
  a.createdAt.localeCompare(b.createdAt);

export const diaryDayQuery = (
  db: Kysely<Database>,
  userId: string,
  date: string,
) =>
  db
    .selectFrom('diary_entries')
    .selectAll()
    .where('user_id', '=', userId)
    .where('date', '=', date);

export const diaryDay = async (
  db: Kysely<Database>,
  userId: string,
  date: string,
) =>
  (await diaryDayQuery(db, userId, date).execute())
    .map(diaryEntry)
    .toSorted(inDayOrder);

export const insertDiaryEntry = async (
  db: Kysely<Database>,
  userId: string,
  input: DiaryEntryInput,
  { now, nextId }: FoodWriteContext,
): Promise<DiaryEntry> => {
  const loggedAt = now();
  const row = await db
    .insertInto('diary_entries')
    .values({
      id: nextId(),
      user_id: userId,
      date: input.date,
      meal: input.meal,
      time: input.time,
      kind: input.kind,
      food_id: input.kind === 'food' ? input.foodId : null,
      recipe_id: input.kind === 'recipe' ? input.recipeId : null,
      label: input.label,
      ...amountOf(input),
      nutrients: JSON.stringify(input.nutrients),
      created_at: loggedAt,
      updated_at: loggedAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return diaryEntry(row);
};

export const diaryEntryDeletion = (
  db: Kysely<Database>,
  userId: string,
  entryId: string,
) =>
  db
    .deleteFrom('diary_entries')
    .where('id', '=', entryId)
    .where('user_id', '=', userId);

export const removeDiaryEntry = async (
  db: Kysely<Database>,
  userId: string,
  entryId: string,
) => {
  const { numDeletedRows } = await diaryEntryDeletion(
    db,
    userId,
    entryId,
  ).executeTakeFirst();
  return numDeletedRows > 0n;
};

export const favouritesQuery = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('favourites')
    .select(['food_id as foodId', 'created_at as createdAt'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc');

export const favourites = (db: Kysely<Database>, userId: string) =>
  favouritesQuery(db, userId).execute();

export type AddedFavourite =
  | { outcome: 'added' }
  | { outcome: 'food-not-found' };

export const addFavourite = (
  db: Kysely<Database>,
  userId: string,
  foodId: string,
  now: () => string,
): Promise<AddedFavourite> =>
  db.transaction().execute(async (trx) => {
    const food = await foodByIdQuery(trx, userId, foodId).executeTakeFirst();
    if (food === undefined) {
      return { outcome: 'food-not-found' };
    }
    await trx
      .insertInto('favourites')
      .values({ user_id: userId, food_id: foodId, created_at: now() })
      .onConflict((conflict) => conflict.doNothing())
      .execute();
    return { outcome: 'added' };
  });

export const favouriteDeletion = (
  db: Kysely<Database>,
  userId: string,
  foodId: string,
) =>
  db
    .deleteFrom('favourites')
    .where('user_id', '=', userId)
    .where('food_id', '=', foodId);

export const removeFavourite = async (
  db: Kysely<Database>,
  userId: string,
  foodId: string,
) => {
  const { numDeletedRows } = await favouriteDeletion(
    db,
    userId,
    foodId,
  ).executeTakeFirst();
  return numDeletedRows > 0n;
};
