import type { Kysely } from 'kysely';
import { isStandardLabel, type Portion } from '../domain/foods/portions.ts';
import {
  foodByIdQuery,
  portionsQuery,
  type StoredPortion,
} from './food-search.ts';
import type { Database } from './schema.ts';

export type UserPortionInput = Portion & { foodId: string };

export type AddedUserPortion =
  | { outcome: 'added'; portion: StoredPortion }
  | { outcome: 'food-not-found' }
  | { outcome: 'label-taken' };

export const addUserPortion = (
  db: Kysely<Database>,
  userId: string,
  { foodId, label, grams }: UserPortionInput,
  nextId: () => string,
): Promise<AddedUserPortion> =>
  db.transaction().execute(async (trx) => {
    const food = await foodByIdQuery(trx, userId, foodId).executeTakeFirst();
    if (food === undefined) {
      return { outcome: 'food-not-found' };
    }
    const visible = await portionsQuery(trx, userId, [foodId])
      .select('position')
      .execute();
    if (
      isStandardLabel(label) ||
      visible.some((portion) => portion.label === label)
    ) {
      return { outcome: 'label-taken' };
    }
    const portion: StoredPortion = {
      id: nextId(),
      label,
      grams,
      source: 'user',
    };
    await trx
      .insertInto('food_portions')
      .values({
        ...portion,
        food_id: foodId,
        user_id: userId,
        position: Math.max(-1, ...visible.map(({ position }) => position)) + 1,
      })
      .execute();
    return { outcome: 'added', portion };
  });

export const userPortionDeletion = (
  db: Kysely<Database>,
  userId: string,
  portionId: string,
) =>
  db
    .deleteFrom('food_portions')
    .where('id', '=', portionId)
    .where('source', '=', 'user')
    .where('user_id', '=', userId);

export const removeUserPortion = async (
  db: Kysely<Database>,
  userId: string,
  portionId: string,
) => {
  const { numDeletedRows } = await userPortionDeletion(
    db,
    userId,
    portionId,
  ).executeTakeFirst();
  return numDeletedRows > 0n;
};
