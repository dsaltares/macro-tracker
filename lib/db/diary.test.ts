import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import {
  addFavourite,
  type DiaryEntryInput,
  diaryDay,
  favourites,
  insertDiaryEntry,
  removeDiaryEntry,
  removeFavourite,
} from './diary.ts';
import { type FoodWriteContext, insertFood } from './foods.ts';

const database = migratedDatabasePerTest();

let context: FoodWriteContext;

beforeEach(async () => {
  let ids = 0;
  let minutes = 0;
  context = {
    nextId: () => `id-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 20, 12, minutes++)).toISOString(),
  };
  await database()
    .insertInto('users')
    .values(
      ['alice', 'bob'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.com`,
      })),
    )
    .execute();
});

const addNutella = () =>
  insertFood(
    database(),
    {
      source: 'off',
      source_id: '3017620422003',
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      quantity_label: '400 g',
      nutrients: { energy_kcal: 539, fat: 30.9 },
      portions: [{ label: '1 serving', grams: 15 }],
    },
    context,
  );

const addOwnFood = (owner: string) =>
  insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: owner,
      barcode: null,
      name: 'Overnight oats',
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 150 },
      portions: [],
    },
    context,
  );

const nutellaEntry = (
  foodId: string,
  overrides: Partial<DiaryEntryInput> = {},
): DiaryEntryInput =>
  ({
    kind: 'food',
    foodId,
    date: '2026-10-20',
    meal: 'breakfast',
    time: '08:15',
    label: 'Nutella',
    quantity: 2,
    portionLabel: '1 serving',
    grams: 30,
    nutrients: { energy_kcal: 161.7, fat: 9.27 },
    ...overrides,
  }) as DiaryEntryInput;

const coffee: DiaryEntryInput = {
  kind: 'quick',
  date: '2026-10-20',
  meal: 'snack',
  time: null,
  label: 'Coffee with milk',
  nutrients: { energy_kcal: 40 },
};

const rowsOf = () =>
  database().selectFrom('diary_entries').selectAll().orderBy('id').execute();

describe('insertDiaryEntry', () => {
  it('logs a food entry with its snapshot and reads it back', async () => {
    const nutellaId = await addNutella();

    const entry = await insertDiaryEntry(
      database(),
      'alice',
      nutellaEntry(nutellaId),
      context,
    );

    expect(entry).toEqual({
      id: expect.any(String),
      kind: 'food',
      foodId: nutellaId,
      recipeId: null,
      date: '2026-10-20',
      meal: 'breakfast',
      time: '08:15',
      label: 'Nutella',
      quantity: 2,
      portionLabel: '1 serving',
      grams: 30,
      nutrients: { energy_kcal: 161.7, fat: 9.27 },
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
    });
    expect(await diaryDay(database(), 'alice', '2026-10-20')).toEqual([entry]);
  });

  it('logs a quick entry with no food and no amount', async () => {
    const entry = await insertDiaryEntry(database(), 'alice', coffee, context);

    expect(entry).toMatchObject({
      kind: 'quick',
      foodId: null,
      recipeId: null,
      quantity: null,
      portionLabel: null,
      grams: null,
      nutrients: { energy_kcal: 40 },
    });
  });

  it('logs a recipe entry linked to its recipe', async () => {
    const entry = await insertDiaryEntry(
      database(),
      'alice',
      {
        kind: 'recipe',
        recipeId: 'recipe-1',
        date: '2026-10-20',
        meal: 'dinner',
        time: null,
        label: 'Lentil soup',
        quantity: 1.5,
        portionLabel: '1 serving',
        grams: 450,
        nutrients: { energy_kcal: 380 },
      },
      context,
    );

    expect(entry).toMatchObject({
      kind: 'recipe',
      foodId: null,
      recipeId: 'recipe-1',
    });
  });

  it('keeps an absent nutrient absent, not zero', async () => {
    const entry = await insertDiaryEntry(
      database(),
      'alice',
      { ...coffee, nutrients: { energy_kcal: 40, protein: 0 } },
      context,
    );

    expect(entry.nutrients).toEqual({ energy_kcal: 40, protein: 0 });
  });
});

describe('diary_entries', () => {
  const insertRaw = (overrides: Record<string, unknown>) =>
    database()
      .insertInto('diary_entries')
      .values({
        id: 'raw',
        user_id: 'alice',
        date: '2026-10-20',
        meal: 'snack',
        time: null,
        kind: 'quick',
        food_id: null,
        recipe_id: null,
        label: 'Apple',
        quantity: null,
        portion_label: null,
        grams: null,
        nutrients: '{"energy_kcal":52}',
        created_at: 't',
        updated_at: 't',
        ...overrides,
      })
      .execute();

  it('accepts a well-formed quick entry', async () => {
    await insertRaw({});

    expect(await rowsOf()).toHaveLength(1);
  });

  it.each([
    ['a date that is not YYYY-MM-DD', { date: '2026-10-20T08:00:00Z' }],
    ['a meal that is not one of the four', { meal: 'brunch' }],
    ['a time that is not HH:MM', { time: '8:15' }],
    ['an unknown kind', { kind: 'drink' }],
    ['a snapshot that is not a JSON object', { nutrients: '[52]' }],
    ['a snapshot that is not JSON', { nutrients: 'energy 52' }],
    ['a quick entry with grams', { grams: 100 }],
    ['a quick entry linked to a recipe', { recipe_id: 'recipe-1' }],
    [
      'a recipe entry without an amount',
      { kind: 'recipe', recipe_id: 'recipe-1' },
    ],
    [
      'a food entry without a portion',
      { kind: 'food', quantity: 1, grams: 100 },
    ],
    [
      'a zero quantity',
      { kind: 'food', quantity: 0, portion_label: '100 g', grams: 100 },
    ],
  ])('refuses %s', async (_, overrides) => {
    await expect(insertRaw(overrides)).rejects.toThrow(/CHECK/);
  });

  it('refuses an entry for a user that does not exist', async () => {
    await expect(insertRaw({ user_id: 'carol' })).rejects.toThrow(
      /FOREIGN KEY/,
    );
  });

  it('keeps the entries of a deleted food, with the link cleared', async () => {
    const oatsId = await addOwnFood('alice');
    await insertDiaryEntry(
      database(),
      'alice',
      nutellaEntry(oatsId, { label: 'Overnight oats' }),
      context,
    );

    await database().deleteFrom('foods').where('id', '=', oatsId).execute();

    expect(await diaryDay(database(), 'alice', '2026-10-20')).toEqual([
      expect.objectContaining({
        kind: 'food',
        foodId: null,
        label: 'Overnight oats',
        nutrients: { energy_kcal: 161.7, fat: 9.27 },
      }),
    ]);
  });

  it('goes with the user it belongs to', async () => {
    await insertDiaryEntry(database(), 'alice', coffee, context);

    await database().deleteFrom('users').where('id', '=', 'alice').execute();

    expect(await rowsOf()).toEqual([]);
  });
});

describe('diaryDay', () => {
  it("reads only the caller's entries on that date, by meal then logging time", async () => {
    const nutellaId = await addNutella();
    const log = (userId: string, input: DiaryEntryInput) =>
      insertDiaryEntry(database(), userId, input, context);
    const lateSnack = await log('alice', coffee);
    await log('alice', { ...coffee, date: '2026-10-21' });
    await log('bob', nutellaEntry(nutellaId));
    const breakfast = await log('alice', nutellaEntry(nutellaId));
    const dinner = await log('alice', { ...coffee, meal: 'dinner' });
    const secondBreakfast = await log(
      'alice',
      nutellaEntry(nutellaId, { time: '07:00' }),
    );

    expect(
      (await diaryDay(database(), 'alice', '2026-10-20')).map(({ id }) => id),
    ).toEqual([breakfast.id, secondBreakfast.id, dinner.id, lateSnack.id]);
  });

  it('reads an empty day as no entries', async () => {
    expect(await diaryDay(database(), 'alice', '2026-10-20')).toEqual([]);
  });
});

describe('removeDiaryEntry', () => {
  it("removes the caller's entry", async () => {
    const entry = await insertDiaryEntry(database(), 'alice', coffee, context);

    expect(await removeDiaryEntry(database(), 'alice', entry.id)).toBe(true);
    expect(await rowsOf()).toEqual([]);
  });

  it("leaves another user's entry alone", async () => {
    const entry = await insertDiaryEntry(database(), 'alice', coffee, context);

    expect(await removeDiaryEntry(database(), 'bob', entry.id)).toBe(false);
    expect(await rowsOf()).toHaveLength(1);
  });
});

describe('favourites', () => {
  it('adds a food the user sees, once, newest first', async () => {
    const nutellaId = await addNutella();
    const oatsId = await addOwnFood('alice');

    expect(
      await addFavourite(database(), 'alice', nutellaId, context.now),
    ).toEqual({ outcome: 'added' });
    await addFavourite(database(), 'alice', oatsId, context.now);
    await addFavourite(database(), 'alice', nutellaId, context.now);

    expect(
      (await favourites(database(), 'alice')).map(({ foodId }) => foodId),
    ).toEqual([oatsId, nutellaId]);
  });

  it("refuses a food the user does not see, such as another user's own", async () => {
    const oatsId = await addOwnFood('alice');

    expect(await addFavourite(database(), 'bob', oatsId, context.now)).toEqual({
      outcome: 'food-not-found',
    });
    expect(await addFavourite(database(), 'bob', 'nope', context.now)).toEqual({
      outcome: 'food-not-found',
    });
    expect(await favourites(database(), 'bob')).toEqual([]);
  });

  it('keeps each user their own favourites', async () => {
    const nutellaId = await addNutella();
    await addFavourite(database(), 'alice', nutellaId, context.now);

    expect(await favourites(database(), 'bob')).toEqual([]);
    expect(await removeFavourite(database(), 'bob', nutellaId)).toBe(false);
    expect(await favourites(database(), 'alice')).toHaveLength(1);
  });

  it('removes a favourite', async () => {
    const nutellaId = await addNutella();
    await addFavourite(database(), 'alice', nutellaId, context.now);

    expect(await removeFavourite(database(), 'alice', nutellaId)).toBe(true);
    expect(await favourites(database(), 'alice')).toEqual([]);
  });

  it('goes with the food', async () => {
    const oatsId = await addOwnFood('alice');
    await addFavourite(database(), 'alice', oatsId, context.now);

    await database().deleteFrom('foods').where('id', '=', oatsId).execute();

    expect(await favourites(database(), 'alice')).toEqual([]);
  });
});
