import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { nutrientKeys } from '../domain/nutrition/nutrients.ts';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import {
  type FoodWriteContext,
  insertFood,
  nutrientsOf,
  type ReferenceFoodInput,
  type UserFoodInput,
  upsertFoods,
} from './foods.ts';

const database = migratedDatabasePerTest();

let context: FoodWriteContext;

beforeEach(() => {
  let ids = 0;
  let minutes = 0;
  context = {
    nextId: () => `id-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 19, 12, minutes++)).toISOString(),
  };
});

const nutella = (
  overrides: Partial<ReferenceFoodInput> = {},
): ReferenceFoodInput => ({
  source: 'off',
  source_id: '3017620422003',
  barcode: '3017620422003',
  name: 'Nutella',
  brand: 'Ferrero',
  quantity_label: '400 g',
  nutrients: { energy_kcal: 539, fat: 30.9, sodium: 42 },
  portions: [{ label: '1 serving', grams: 15 }],
  ...overrides,
});

const porridge: UserFoodInput = {
  source: 'user',
  owner_user_id: 'user-1',
  barcode: null,
  name: 'Overnight oats',
  brand: null,
  quantity_label: null,
  nutrients: { energy_kcal: 150 },
  portions: [{ label: '1 jar', grams: 250 }],
};

const everyNutrient: NutrientVector = Object.fromEntries(
  nutrientKeys.map((key, order) => [key, order + 0.25]),
);

const foodById = (id: string) =>
  database()
    .selectFrom('foods')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();

const theOnlyFood = () =>
  database()
    .selectFrom('foods')
    .select(['id', 'created_at'])
    .executeTakeFirstOrThrow();

const portionsOf = (foodId: string) =>
  database()
    .selectFrom('food_portions')
    .select(['id', 'label', 'grams', 'source', 'user_id', 'position'])
    .where('food_id', '=', foodId)
    .orderBy('source')
    .orderBy('position')
    .execute();

const search = async (query: string) => {
  const { rows } = await sql<{ id: string }>`
    select foods.id from foods_fts
    join foods on foods.rowid = foods_fts.rowid
    where foods_fts match ${query}
    order by foods.id
  `.execute(database());
  return rows.map(({ id }) => id);
};

describe('food_nutrients', () => {
  it('has one column per canonical nutrient, in canon order', async () => {
    const { rows } = await sql<{
      name: string;
      type: string;
    }>`pragma table_info(food_nutrients)`.execute(database());

    expect(rows.map(({ name, type }) => [name, type.toLowerCase()])).toEqual([
      ['food_id', 'text'],
      ...nutrientKeys.map((key) => [key, 'real']),
    ]);
  });
});

describe('insertFood', () => {
  it('reads back every nutrient as the vector it was given', async () => {
    const id = await insertFood(
      database(),
      nutella({ nutrients: everyNutrient }),
      context,
    );

    expect(await nutrientsOf(database(), id)).toEqual(everyNutrient);
  });

  it('reads a nutrient it was not given back as absent, not zero', async () => {
    const id = await insertFood(database(), nutella(), context);

    expect(await nutrientsOf(database(), id)).toEqual({
      energy_kcal: 539,
      fat: 30.9,
      sodium: 42,
    });
  });

  it('has no nutrients for a food that does not exist', async () => {
    expect(await nutrientsOf(database(), 'missing')).toBeUndefined();
  });

  it('writes a reference food with its upstream portions', async () => {
    const id = await insertFood(
      database(),
      nutella({ fetched_live_at: '2026-10-19T11:00:00.000Z' }),
      context,
    );

    expect(await foodById(id)).toMatchObject({
      source: 'off',
      source_id: '3017620422003',
      owner_user_id: null,
      fetched_live_at: '2026-10-19T11:00:00.000Z',
      archived_at: null,
      created_at: '2026-10-19T12:00:00.000Z',
      updated_at: '2026-10-19T12:00:00.000Z',
    });
    expect(await portionsOf(id)).toEqual([
      {
        id: 'id-2',
        label: '1 serving',
        grams: 15,
        source: 'upstream',
        user_id: null,
        position: 0,
      },
    ]);
  });

  it('writes a user food with its owner and the owner portions', async () => {
    const id = await insertFood(database(), porridge, context);

    expect(await foodById(id)).toMatchObject({
      source: 'user',
      source_id: null,
      owner_user_id: 'user-1',
      fetched_live_at: null,
    });
    expect(await portionsOf(id)).toEqual([
      expect.objectContaining({ source: 'user', user_id: 'user-1' }),
    ]);
  });

  it('writes nothing when a part of the food is refused', async () => {
    await expect(
      insertFood(
        database(),
        nutella({ portions: [{ label: 'nothing', grams: 0 }] }),
        context,
      ),
    ).rejects.toThrow(/CHECK constraint/);

    expect(await database().selectFrom('foods').select('id').execute()).toEqual(
      [],
    );
  });
});

describe('the foods table', () => {
  it('refuses a user food without an owner', async () => {
    await expect(
      insertFood(
        database(),
        { ...porridge, owner_user_id: null } as unknown as UserFoodInput,
        context,
      ),
    ).rejects.toThrow(/CHECK constraint/);
  });

  it('refuses a reference food without a source id', async () => {
    await expect(
      insertFood(
        database(),
        nutella({ source_id: null } as unknown as ReferenceFoodInput),
        context,
      ),
    ).rejects.toThrow(/CHECK constraint/);
  });

  it('refuses a second reference food with the same source and source id', async () => {
    await insertFood(database(), nutella(), context);

    await expect(insertFood(database(), nutella(), context)).rejects.toThrow(
      /UNIQUE constraint/,
    );
  });

  it('deletes a food’s nutrients and portions with it', async () => {
    const id = await insertFood(database(), nutella(), context);

    await database().deleteFrom('foods').where('id', '=', id).execute();

    expect(await nutrientsOf(database(), id)).toBeUndefined();
    expect(await portionsOf(id)).toEqual([]);
  });
});

describe('upsertFoods', () => {
  it('inserts the foods it has not seen and counts them', async () => {
    const counts = await upsertFoods(
      database(),
      [nutella(), nutella({ source: 'ciqual', source_id: '31032' })],
      context,
    );

    expect(counts).toEqual({ inserted: 2, updated: 0 });
    expect(await search('nutella')).toHaveLength(2);
  });

  it('updates a food it has seen in place, by source and source id', async () => {
    await upsertFoods(database(), [nutella()], context);
    const { id, created_at } = await theOnlyFood();

    const counts = await upsertFoods(
      database(),
      [nutella({ name: 'Nutella hazelnut spread', nutrients: { fat: 31 } })],
      context,
    );

    expect(counts).toEqual({ inserted: 0, updated: 1 });
    expect(await foodById(id)).toMatchObject({
      name: 'Nutella hazelnut spread',
      created_at,
      updated_at: '2026-10-19T12:01:00.000Z',
    });
    expect(await nutrientsOf(database(), id)).toEqual({ fat: 31 });
  });

  it('brings an archived food back when it is seen again', async () => {
    await upsertFoods(database(), [nutella()], context);
    await database()
      .updateTable('foods')
      .set({ archived_at: '2026-10-19T00:00:00.000Z' })
      .execute();

    await upsertFoods(database(), [nutella()], context);

    expect(
      await database().selectFrom('foods').select('archived_at').execute(),
    ).toEqual([{ archived_at: null }]);
  });

  it('keeps when a food was fetched live', async () => {
    const id = await insertFood(
      database(),
      nutella({ fetched_live_at: '2026-10-19T11:00:00.000Z' }),
      context,
    );

    await upsertFoods(database(), [nutella()], context);

    expect(await foodById(id)).toMatchObject({
      fetched_live_at: '2026-10-19T11:00:00.000Z',
    });
  });

  it('keeps an upstream portion by label, and replaces the rest', async () => {
    await upsertFoods(
      database(),
      [
        nutella({
          portions: [
            { label: '1 serving', grams: 15 },
            { label: '1 tbsp', grams: 20 },
          ],
        }),
      ],
      context,
    );
    const { id } = await theOnlyFood();
    const [serving] = await portionsOf(id);

    await upsertFoods(
      database(),
      [
        nutella({
          portions: [
            { label: '1 jar', grams: 400 },
            { label: '1 serving', grams: 16 },
          ],
        }),
      ],
      context,
    );

    expect(await portionsOf(id)).toEqual([
      expect.objectContaining({ label: '1 jar', grams: 400, position: 0 }),
      { ...serving, grams: 16, position: 1 },
    ]);
  });

  it('removes every upstream portion when upstream has none', async () => {
    await upsertFoods(database(), [nutella()], context);

    await upsertFoods(database(), [nutella({ portions: [] })], context);

    const { id } = await theOnlyFood();
    expect(await portionsOf(id)).toEqual([]);
  });

  it('leaves a user’s own portions on a reference food alone', async () => {
    await upsertFoods(database(), [nutella()], context);
    const { id } = await theOnlyFood();
    await database()
      .insertInto('food_portions')
      .values({
        id: 'mine',
        food_id: id,
        label: '1 serving',
        grams: 25,
        source: 'user',
        user_id: 'user-1',
        position: 0,
      })
      .execute();

    await upsertFoods(database(), [nutella({ portions: [] })], context);

    expect(await portionsOf(id)).toEqual([
      expect.objectContaining({ id: 'mine', grams: 25 }),
    ]);
  });

  it('leaves user foods alone', async () => {
    const id = await insertFood(database(), porridge, context);

    await upsertFoods(database(), [nutella()], context);

    expect(await nutrientsOf(database(), id)).toEqual({ energy_kcal: 150 });
    expect(await portionsOf(id)).toHaveLength(1);
  });

  it('writes nothing from a batch when one food in it is refused', async () => {
    await expect(
      upsertFoods(
        database(),
        [
          nutella(),
          nutella({
            source_id: '2',
            portions: [{ label: 'nothing', grams: -1 }],
          }),
        ],
        context,
      ),
    ).rejects.toThrow(/CHECK constraint/);

    expect(await database().selectFrom('foods').select('id').execute()).toEqual(
      [],
    );
  });
});

describe('foods_fts', () => {
  let nutellaId: string;
  let creme: string;

  beforeEach(async () => {
    nutellaId = await insertFood(database(), nutella(), context);
    creme = await insertFood(
      database(),
      nutella({
        source_id: '3254381025207',
        name: 'Crème fraîche épaisse',
        brand: 'Président',
      }),
      context,
    );
  });

  it('finds a food by its name', async () => {
    expect(await search('nutella')).toEqual([nutellaId]);
  });

  it('finds a food by its brand', async () => {
    expect(await search('ferrero')).toEqual([nutellaId]);
  });

  it('finds an accented name from a query without accents', async () => {
    expect(await search('creme fraiche')).toEqual([creme]);
  });

  it('finds a generic food by its original name', async () => {
    const lentils = await insertFood(
      database(),
      nutella({
        source: 'ciqual',
        source_id: '20503',
        barcode: null,
        name: 'Red kidney bean, boiled/cooked in water',
        original_name: "Haricot rouge, bouilli/cuit à l'eau",
        brand: null,
      }),
      context,
    );

    expect(await search('haricot')).toEqual([lentils]);
    expect(await search('bean')).toEqual([lentils]);
  });

  it('follows an original name an import changes', async () => {
    const generic = nutella({
      source: 'ciqual',
      source_id: '13039',
      barcode: null,
      name: 'Apple, flesh and skin, raw',
      original_name: 'Pomme crue',
      brand: null,
    });
    await upsertFoods(database(), [generic], context);

    await upsertFoods(
      database(),
      [{ ...generic, original_name: 'Pomme, chair et peau, crue' }],
      context,
    );

    expect(await search('crue')).toHaveLength(1);
    expect(await search('chair')).toHaveLength(1);
    expect(
      (
        await database()
          .selectFrom('foods')
          .select('original_name')
          .where('source_id', '=', '13039')
          .executeTakeFirstOrThrow()
      ).original_name,
    ).toBe('Pomme, chair et peau, crue');
  });

  it('finds a food from the prefix of a word', async () => {
    expect(await search('presi*')).toEqual([creme]);
  });

  it('follows a renamed food', async () => {
    await database()
      .updateTable('foods')
      .set({ name: 'Hazelnut spread' })
      .where('id', '=', nutellaId)
      .execute();

    expect(await search('nutella')).toEqual([]);
    expect(await search('hazelnut')).toEqual([nutellaId]);
  });

  it('forgets a deleted food', async () => {
    await database().deleteFrom('foods').where('id', '=', nutellaId).execute();

    expect(await search('nutella')).toEqual([]);
  });

  it('stays in step with foods after a vacuum', async () => {
    await database().deleteFrom('foods').where('id', '=', nutellaId).execute();

    await sql`vacuum`.execute(database());

    expect(await search('creme')).toEqual([creme]);
  });

  it('passes an integrity check', async () => {
    await upsertFoods(
      database(),
      [nutella({ name: 'Nutella B-ready', brand: null })],
      context,
    );

    await expect(
      sql`insert into foods_fts (foods_fts, rank) values ('integrity-check', 1)`.execute(
        database(),
      ),
    ).resolves.toBeDefined();
  });
});
