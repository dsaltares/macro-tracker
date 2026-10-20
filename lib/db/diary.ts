import { type Kysely, type Selectable, sql } from 'kysely';
import { addDays } from '../domain/dates.ts';
import { type Meal, meals, resolveEntry } from '../domain/diary/entries.ts';
import type { Portion } from '../domain/foods/portions.ts';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import {
  type Food,
  findFood,
  foodByIdQuery,
  type LastLoggedAmount,
  withLastLoggedAmounts,
} from './food-search.ts';
import { type FoodWriteContext, writeFood } from './foods.ts';
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

export type QuickEntryToLog = Omit<QuickEntryInput, 'kind'> & {
  foodPer100g: NutrientVector | null;
};

export const logQuickEntry = (
  db: Kysely<Database>,
  userId: string,
  { foodPer100g, ...entry }: QuickEntryToLog,
  context: FoodWriteContext,
) =>
  db.transaction().execute(async (trx) => {
    if (foodPer100g !== null) {
      await writeFood(
        trx,
        {
          source: 'user',
          owner_user_id: userId,
          barcode: null,
          name: entry.label,
          brand: null,
          quantity_label: null,
          nutrients: foodPer100g,
          portions: [],
        },
        context,
      );
    }
    return insertDiaryEntry(trx, userId, { kind: 'quick', ...entry }, context);
  });

export type FoodToLog = {
  date: string;
  meal: Meal;
  time: string | null;
  foodId: string;
  portion: string;
  quantity: number;
};

export type LoggedFood =
  | { outcome: 'logged'; entry: DiaryEntry }
  | { outcome: 'food-not-found' }
  | { outcome: 'portion-not-found' };

const portionLabelled = (food: Food, label: string): Portion | undefined =>
  food.portions.find((portion) => portion.label === label);

export const logFood = (
  db: Kysely<Database>,
  userId: string,
  { foodId, portion: portionLabel, quantity, ...when }: FoodToLog,
  context: FoodWriteContext,
): Promise<LoggedFood> =>
  db.transaction().execute(async (trx) => {
    const food = await findFood({ db: trx, userId }, foodId);
    if (food === null) {
      return { outcome: 'food-not-found' };
    }
    const portion = portionLabelled(food, portionLabel);
    if (portion === undefined) {
      return { outcome: 'portion-not-found' };
    }
    const { grams, nutrients } = resolveEntry(food, portion, quantity);
    const entry = await insertDiaryEntry(
      trx,
      userId,
      {
        kind: 'food',
        ...when,
        foodId,
        label: food.name,
        quantity,
        portionLabel: portion.label,
        grams,
        nutrients,
      },
      context,
    );
    return { outcome: 'logged', entry };
  });

export type DiaryEntryChanges = {
  date?: string | undefined;
  meal?: Meal | undefined;
  time?: string | null | undefined;
  quantity?: number | undefined;
  portion?: string | undefined;
};

export type UpdatedDiaryEntry =
  | { outcome: 'updated'; entry: DiaryEntry }
  | { outcome: 'not-found' }
  | { outcome: 'no-amount' }
  | { outcome: 'food-gone' }
  | { outcome: 'portion-not-found' };

export const diaryEntryQuery = (
  db: Kysely<Database>,
  userId: string,
  entryId: string,
) =>
  db
    .selectFrom('diary_entries')
    .selectAll()
    .where('id', '=', entryId)
    .where('user_id', '=', userId);

const reresolvedAmount = async (
  db: Kysely<Database>,
  userId: string,
  row: Selectable<DiaryEntriesTable>,
  changes: DiaryEntryChanges,
) => {
  if (row.kind === 'quick') {
    return { outcome: 'no-amount' } as const;
  }
  const food =
    row.food_id === null ? null : await findFood({ db, userId }, row.food_id);
  if (
    food === null ||
    row.quantity === null ||
    row.portion_label === null ||
    row.grams === null
  ) {
    return { outcome: 'food-gone' } as const;
  }
  const loggedPortion: Portion = {
    label: row.portion_label,
    grams: row.grams / row.quantity,
  };
  const portion =
    changes.portion === undefined
      ? (portionLabelled(food, row.portion_label) ?? loggedPortion)
      : portionLabelled(food, changes.portion);
  if (portion === undefined) {
    return { outcome: 'portion-not-found' } as const;
  }
  const quantity = changes.quantity ?? row.quantity;
  const { grams, nutrients } = resolveEntry(food, portion, quantity);
  return {
    outcome: 'resolved',
    amount: {
      quantity,
      portion_label: portion.label,
      grams,
      nutrients: JSON.stringify(nutrients),
    },
  } as const;
};

export const updateDiaryEntry = (
  db: Kysely<Database>,
  userId: string,
  entryId: string,
  { date, meal, time, ...amountChanges }: DiaryEntryChanges,
  now: () => string,
): Promise<UpdatedDiaryEntry> =>
  db.transaction().execute(async (trx) => {
    const row = await diaryEntryQuery(trx, userId, entryId).executeTakeFirst();
    if (row === undefined) {
      return { outcome: 'not-found' };
    }
    const changesAmount =
      amountChanges.quantity !== undefined ||
      amountChanges.portion !== undefined;
    const resolved = changesAmount
      ? await reresolvedAmount(trx, userId, row, amountChanges)
      : ({ outcome: 'resolved', amount: {} } as const);
    if (resolved.outcome !== 'resolved') {
      return resolved;
    }
    const updated = await trx
      .updateTable('diary_entries')
      .set({ date, meal, time, ...resolved.amount, updated_at: now() })
      .where('id', '=', entryId)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { outcome: 'updated', entry: diaryEntry(updated) };
  });

export type MealCopy = {
  fromDate: string;
  meal: Meal;
  toDate: string;
  toMeal: Meal;
};

export const copyDiaryMeal = (
  db: Kysely<Database>,
  userId: string,
  { fromDate, meal, toDate, toMeal }: MealCopy,
  { now, nextId }: FoodWriteContext,
): Promise<DiaryEntry[]> =>
  db.transaction().execute(async (trx) => {
    const rows = (
      await diaryDayQuery(trx, userId, fromDate)
        .where('meal', '=', meal)
        .execute()
    ).toSorted((a, b) => a.created_at.localeCompare(b.created_at));
    if (rows.length === 0) {
      return [];
    }
    const copiedAt = now();
    const copies = await trx
      .insertInto('diary_entries')
      .values(
        rows.map((row) => ({
          ...row,
          id: nextId(),
          date: toDate,
          meal: toMeal,
          created_at: copiedAt,
          updated_at: copiedAt,
        })),
      )
      .returningAll()
      .execute();
    return copies.map(diaryEntry);
  });

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

export type DiaryMeal = {
  date: string;
  meal: Meal;
};

export const diaryMealDeletion = (
  db: Kysely<Database>,
  userId: string,
  { date, meal }: DiaryMeal,
) =>
  db
    .deleteFrom('diary_entries')
    .where('user_id', '=', userId)
    .where('date', '=', date)
    .where('meal', '=', meal);

export const clearDiaryMeal = async (
  db: Kysely<Database>,
  userId: string,
  meal: DiaryMeal,
) => {
  const { numDeletedRows } = await diaryMealDeletion(
    db,
    userId,
    meal,
  ).executeTakeFirst();
  return Number(numDeletedRows);
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

export const foodListLength = 30;

export const frequentFoodsDays = 90;

const loggedFoodsQuery = (db: Kysely<Database>, userId: string) =>
  db
    .selectFrom('diary_entries')
    .where('user_id', '=', userId)
    .where('kind', '=', 'food')
    .where('food_id', 'is not', null)
    .groupBy('food_id')
    // SQLite fills bare columns beside a lone max() from the row holding that max, so
    // portion_label and quantity are those of the food's latest entry.
    .select([
      'food_id as foodId',
      'portion_label as portionLabel',
      'quantity',
      sql<string>`max(created_at)`.as('lastLoggedAt'),
    ])
    .$narrowType<{ foodId: string }>();

export const recentFoodsQuery = (db: Kysely<Database>, userId: string) =>
  loggedFoodsQuery(db, userId)
    .orderBy('lastLoggedAt', 'desc')
    .limit(foodListLength);

export const frequentFoodsQuery = (
  db: Kysely<Database>,
  userId: string,
  date: string,
) =>
  loggedFoodsQuery(db, userId)
    .where('date', '>', addDays(date, -frequentFoodsDays))
    .where('date', '<=', date)
    .select(sql<number>`count(*)`.as('timesLogged'))
    .orderBy('timesLogged', 'desc')
    .orderBy('lastLoggedAt', 'desc')
    .limit(foodListLength);

export const lastLoggedAmountsQuery = (
  db: Kysely<Database>,
  userId: string,
  foodIds: readonly string[],
) => loggedFoodsQuery(db, userId).where('food_id', 'in', foodIds);

export const recentFoods = async (db: Kysely<Database>, userId: string) =>
  withLastLoggedAmounts(
    { db, userId },
    await recentFoodsQuery(db, userId).execute(),
  );

export const frequentFoods = async (
  db: Kysely<Database>,
  userId: string,
  date: string,
) =>
  withLastLoggedAmounts(
    { db, userId },
    await frequentFoodsQuery(db, userId, date).execute(),
  );

export const favouriteFoods = async (db: Kysely<Database>, userId: string) => {
  const foodIds = (await favourites(db, userId)).map(({ foodId }) => foodId);
  if (foodIds.length === 0) {
    return [];
  }
  const lastLogged = new Map(
    (await lastLoggedAmountsQuery(db, userId, foodIds).execute()).map(
      (amount) => [amount.foodId, amount],
    ),
  );
  return withLastLoggedAmounts(
    { db, userId },
    foodIds.map(
      (foodId): LastLoggedAmount =>
        lastLogged.get(foodId) ?? {
          foodId,
          portionLabel: null,
          quantity: null,
        },
    ),
  );
};
