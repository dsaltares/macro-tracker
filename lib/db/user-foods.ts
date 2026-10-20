import type { Kysely, Transaction } from 'kysely';
import type { UserFoodFields } from '../domain/foods/user-food.ts';
import {
  type FoodWriteContext,
  rewriteUserFood,
  type UserFoodInput,
  writeFood,
} from './foods.ts';
import type { Database } from './schema.ts';

export type UserFoodWrite =
  | { outcome: 'saved'; id: string }
  | { outcome: 'food-not-found' }
  | { outcome: 'barcode-taken' };

const userFoodInput = (
  userId: string,
  { name, brand, barcode, quantityLabel, nutrients, portions }: UserFoodFields,
): UserFoodInput => ({
  source: 'user',
  owner_user_id: userId,
  name,
  brand,
  barcode,
  quantity_label: quantityLabel,
  nutrients,
  portions,
});

export const ownFoodQuery = (
  db: Kysely<Database> | Transaction<Database>,
  userId: string,
  foodId: string,
) =>
  db
    .selectFrom('foods')
    .select('id')
    .where('id', '=', foodId)
    .where('owner_user_id', '=', userId)
    .where('archived_at', 'is', null);

export const ownBarcodeQuery = (
  db: Kysely<Database> | Transaction<Database>,
  userId: string,
  barcode: string,
) =>
  db
    .selectFrom('foods')
    .select('id')
    .where('barcode', '=', barcode)
    .where('owner_user_id', '=', userId)
    .where('archived_at', 'is', null);

const barcodeTaken = async (
  trx: Transaction<Database>,
  userId: string,
  { barcode }: UserFoodFields,
  foodId: string | null,
) => {
  if (barcode === null) {
    return false;
  }
  const holders = await ownBarcodeQuery(trx, userId, barcode).execute();
  return holders.some(({ id }) => id !== foodId);
};

export const createUserFood = (
  db: Kysely<Database>,
  userId: string,
  food: UserFoodFields,
  context: FoodWriteContext,
): Promise<UserFoodWrite> =>
  db.transaction().execute(async (trx) => {
    if (await barcodeTaken(trx, userId, food, null)) {
      return { outcome: 'barcode-taken' };
    }
    const id = await writeFood(trx, userFoodInput(userId, food), context);
    return { outcome: 'saved', id };
  });

export const updateUserFood = (
  db: Kysely<Database>,
  userId: string,
  foodId: string,
  food: UserFoodFields,
  context: FoodWriteContext,
): Promise<UserFoodWrite> =>
  db.transaction().execute(async (trx) => {
    const own = await ownFoodQuery(trx, userId, foodId).executeTakeFirst();
    if (own === undefined) {
      return { outcome: 'food-not-found' };
    }
    if (await barcodeTaken(trx, userId, food, foodId)) {
      return { outcome: 'barcode-taken' };
    }
    await rewriteUserFood(trx, foodId, userFoodInput(userId, food), context);
    return { outcome: 'saved', id: foodId };
  });

export const userFoodArchival = (
  db: Kysely<Database>,
  userId: string,
  foodId: string,
  at: string,
) =>
  db
    .updateTable('foods')
    .set({ archived_at: at, updated_at: at })
    .where('id', '=', foodId)
    .where('owner_user_id', '=', userId)
    .where('archived_at', 'is', null);

export const archiveUserFood = async (
  db: Kysely<Database>,
  userId: string,
  foodId: string,
  now: () => string,
) => {
  const { numUpdatedRows } = await userFoodArchival(
    db,
    userId,
    foodId,
    now(),
  ).executeTakeFirst();
  return numUpdatedRows > 0n;
};
