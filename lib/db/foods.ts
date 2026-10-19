import {
  type Insertable,
  type Kysely,
  type Selectable,
  sql,
  type Transaction,
} from 'kysely';
import {
  type PortionSource,
  type ReferenceSource,
  referenceSources,
} from '../domain/foods/sources.ts';
import { nutrientKeys } from '../domain/nutrition/nutrients.ts';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import type { Database, FoodNutrientsTable } from './schema.ts';

export type FoodWriteContext = {
  now: () => string;
  nextId: () => string;
};

export type PortionInput = {
  label: string;
  grams: number;
};

type FoodFields = {
  barcode: string | null;
  name: string;
  original_name?: string | null;
  brand: string | null;
  quantity_label: string | null;
  nutrients: NutrientVector;
  portions: readonly PortionInput[];
};

export type ReferenceFoodInput = FoodFields & {
  source: ReferenceSource;
  source_id: string;
  fetched_live_at?: string;
};

export type UserFoodInput = FoodFields & {
  source: 'user';
  owner_user_id: string;
};

export type FoodInput = ReferenceFoodInput | UserFoodInput;

export type UpsertCounts = {
  inserted: number;
  updated: number;
};

type Writer = Kysely<Database> | Transaction<Database>;

const nutrientRow = (
  foodId: string,
  nutrients: NutrientVector,
): Insertable<FoodNutrientsTable> =>
  ({
    food_id: foodId,
    ...Object.fromEntries(
      nutrientKeys.map((key) => [key, nutrients[key] ?? null]),
    ),
  }) as Insertable<FoodNutrientsTable>;

export const nutrientVector = (
  row: Selectable<FoodNutrientsTable>,
): NutrientVector =>
  Object.fromEntries(
    nutrientKeys.flatMap((key) => {
      const amount = row[key];
      return amount === null ? [] : [[key, amount]];
    }),
  );

const writeNutrients = (
  db: Writer,
  foodId: string,
  nutrients: NutrientVector,
) =>
  db
    .insertInto('food_nutrients')
    .values(nutrientRow(foodId, nutrients))
    .onConflict((conflict) =>
      conflict
        .column('food_id')
        .doUpdateSet((eb) =>
          Object.fromEntries(
            nutrientKeys.map((key) => [key, eb.ref(`excluded.${key}`)]),
          ),
        ),
    )
    .execute();

type PortionOwner = { source: PortionSource; user_id: string | null };

const upstream: PortionOwner = { source: 'upstream', user_id: null };

const portionRows = (
  foodId: string,
  portions: readonly PortionInput[],
  owner: PortionOwner,
  nextId: () => string,
) =>
  portions.map(({ label, grams }, position) => ({
    id: nextId(),
    food_id: foodId,
    label,
    grams,
    position,
    ...owner,
  }));

const insertPortions = async (
  db: Writer,
  foodId: string,
  portions: readonly PortionInput[],
  owner: PortionOwner,
  nextId: () => string,
) => {
  if (portions.length === 0) {
    return;
  }
  await db
    .insertInto('food_portions')
    .values(portionRows(foodId, portions, owner, nextId))
    .execute();
};

const replaceUpstreamPortions = async (
  db: Writer,
  foodId: string,
  portions: readonly PortionInput[],
  nextId: () => string,
) => {
  const labels = portions.map(({ label }) => label);
  let stale = db
    .deleteFrom('food_portions')
    .where('food_id', '=', foodId)
    .where('source', '=', 'upstream');
  if (labels.length > 0) {
    stale = stale.where('label', 'not in', labels);
  }
  await stale.execute();
  if (portions.length === 0) {
    return;
  }
  await db
    .insertInto('food_portions')
    .values(portionRows(foodId, portions, upstream, nextId))
    .onConflict((conflict) =>
      conflict
        .columns(['food_id', 'label'])
        .where('source', '=', sql.lit('upstream'))
        .doUpdateSet((eb) => ({
          grams: eb.ref('excluded.grams'),
          position: eb.ref('excluded.position'),
        })),
    )
    .execute();
};

const foodColumns = ({
  barcode,
  name,
  original_name = null,
  brand,
  quantity_label,
}: FoodFields) => ({
  barcode,
  name,
  original_name,
  brand,
  quantity_label,
});

export const insertFood = (
  db: Kysely<Database>,
  food: FoodInput,
  { now, nextId }: FoodWriteContext,
) =>
  db.transaction().execute(async (trx) => {
    const id = nextId();
    const at = now();
    const isUserFood = food.source === 'user';
    await trx
      .insertInto('foods')
      .values({
        id,
        source: food.source,
        source_id: isUserFood ? null : food.source_id,
        owner_user_id: isUserFood ? food.owner_user_id : null,
        fetched_live_at: isUserFood ? null : (food.fetched_live_at ?? null),
        ...foodColumns(food),
        created_at: at,
        updated_at: at,
      })
      .execute();
    await writeNutrients(trx, id, food.nutrients);
    await insertPortions(
      trx,
      id,
      food.portions,
      isUserFood ? { source: 'user', user_id: food.owner_user_id } : upstream,
      nextId,
    );
    return id;
  });

export const upsertFoods = (
  db: Kysely<Database>,
  batch: readonly ReferenceFoodInput[],
  { now, nextId }: FoodWriteContext,
): Promise<UpsertCounts> =>
  db.transaction().execute(async (trx) => {
    const at = now();
    let inserted = 0;
    for (const food of batch) {
      const candidateId = nextId();
      const { id } = await trx
        .insertInto('foods')
        .values({
          id: candidateId,
          source: food.source,
          source_id: food.source_id,
          ...foodColumns(food),
          created_at: at,
          updated_at: at,
        })
        .onConflict((conflict) =>
          conflict.columns(['source', 'source_id']).doUpdateSet((eb) => ({
            barcode: eb.ref('excluded.barcode'),
            name: eb.ref('excluded.name'),
            original_name: eb.ref('excluded.original_name'),
            brand: eb.ref('excluded.brand'),
            quantity_label: eb.ref('excluded.quantity_label'),
            archived_at: null,
            updated_at: eb.ref('excluded.updated_at'),
          })),
        )
        .returning('id')
        .executeTakeFirstOrThrow();
      if (id === candidateId) {
        inserted++;
      }
      await writeNutrients(trx, id, food.nutrients);
      await replaceUpstreamPortions(trx, id, food.portions, nextId);
    }
    return { inserted, updated: batch.length - inserted };
  });

export const nutrientsOf = async (db: Kysely<Database>, foodId: string) => {
  const row = await db
    .selectFrom('food_nutrients')
    .selectAll()
    .where('food_id', '=', foodId)
    .executeTakeFirst();
  return row && nutrientVector(row);
};

export const archiveUnseenFoods = async (
  db: Kysely<Database>,
  sources: readonly ReferenceSource[],
  seenSince: string,
  now: () => string,
) => {
  if (sources.length === 0) {
    return 0;
  }
  const at = now();
  const archived = await db
    .updateTable('foods')
    .set({ archived_at: at, updated_at: at })
    .where('source', 'in', sources)
    .where('archived_at', 'is', null)
    .where('updated_at', '<', seenSince)
    .executeTakeFirst();
  return Number(archived.numUpdatedRows);
};

export const hasReferenceFoods = async (db: Kysely<Database>) => {
  const food = await db
    .selectFrom('foods')
    .select('id')
    .where('source', 'in', referenceSources)
    .limit(1)
    .executeTakeFirst();
  return food !== undefined;
};
