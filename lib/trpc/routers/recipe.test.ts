import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { type FoodWriteContext, insertFood } from '../../db/foods.ts';
import { createCaller } from '../root.ts';

const database = migratedDatabasePerTest();

let clock: FoodWriteContext;
let oatsId: string;
let milkId: string;
let bobsFoodId: string;

const as = (userId: string | null) =>
  createCaller({
    db: database(),
    caller: userId === null ? null : { userId },
    ...clock,
  });

beforeEach(async () => {
  let ids = 0;
  let seconds = 0;
  clock = {
    nextId: () => `id-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, seconds++)).toISOString(),
  };
  await database()
    .insertInto('users')
    .values(
      ['alice', 'bob'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
      })),
    )
    .execute();
  oatsId = await insertFood(
    database(),
    {
      source: 'off',
      source_id: '5000000000001',
      barcode: '5000000000001',
      name: 'Rolled oats',
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 380, protein: 13, carbohydrate: 60, fat: 7 },
      portions: [{ label: '1 cup', grams: 80 }],
    },
    clock,
  );
  milkId = await insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: 'alice',
      barcode: null,
      name: 'Milk',
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 50, protein: 3.5, fat: 2, calcium: 120 },
      portions: [],
    },
    clock,
  );
  bobsFoodId = await insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: 'bob',
      barcode: null,
      name: "Bob's stock",
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 10 },
      portions: [],
    },
    clock,
  );
});

const fields = {
  servings: 4,
  cookedWeightG: null,
  notes: null,
};

const create = (name: string, overrides: Partial<typeof fields> = {}) =>
  as('alice').recipe.create({ name, ...fields, ...overrides });

const addFood = (
  recipeId: string,
  foodId: string,
  portion = '100 g',
  quantity = 1,
) =>
  as('alice').recipe.addIngredient({
    recipeId,
    ingredient: { kind: 'food', foodId },
    portion,
    quantity,
  });

const addRecipe = (recipeId: string, childId: string) =>
  as('alice').recipe.addIngredient({
    recipeId,
    ingredient: { kind: 'recipe', recipeId: childId },
    portion: '1 serving',
    quantity: 1,
  });

const porridge = async () => {
  const id = await create('Porridge');
  await addFood(id, oatsId, '1 cup', 2.5);
  await addFood(id, milkId, '100 g', 6);
  return id;
};

const ingredientNames = async (recipeId: string) =>
  (await as('alice').recipe.get(recipeId)).ingredients.map(({ name }) => name);

describe('recipe.create and recipe.list', () => {
  it("lists the caller's live recipes by name, and nobody else's", async () => {
    await create('Stew');
    const bread = await create('Bread');
    await create('Apple pie');
    await as('bob').recipe.create({ name: 'Curry', ...fields });
    await as('alice').recipe.archive(bread);

    expect((await as('alice').recipe.list()).map(({ name }) => name)).toEqual([
      'Apple pie',
      'Stew',
    ]);
  });

  it('trims the name and keeps blank notes as none', async () => {
    const id = await as('alice').recipe.create({
      name: '  Stew ',
      ...fields,
      notes: '  ',
    });

    expect(await as('alice').recipe.get(id)).toMatchObject({
      name: 'Stew',
      notes: null,
    });
  });

  it('refuses no servings or a blank name', async () => {
    await expect(create('Stew', { servings: 0 })).rejects.toThrow();
    await expect(create('  ')).rejects.toThrow();
  });

  it('refuses anyone not signed in', async () => {
    await expect(as(null).recipe.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('recipe.get', () => {
  it('reads a recipe with the current nutrition of each ingredient', async () => {
    const id = await porridge();

    const recipe = await as('alice').recipe.get(id);

    expect(recipe).toMatchObject({
      name: 'Porridge',
      servings: 4,
      archived: false,
      ingredients: [
        {
          kind: 'food',
          foodId: oatsId,
          name: 'Rolled oats',
          portionLabel: '1 cup',
          quantity: 2.5,
          grams: 200,
          nutrients: { energy_kcal: 760, protein: 26 },
        },
        {
          kind: 'food',
          foodId: milkId,
          name: 'Milk',
          portionLabel: '100 g',
          quantity: 6,
          grams: 600,
          nutrients: { energy_kcal: 300, calcium: 720 },
        },
      ],
      nutrients: {
        grams: 800,
        total: { energy_kcal: 1060, protein: 47 },
        perServing: { energy_kcal: 265 },
      },
      portions: [
        { label: '1 serving', grams: 200 },
        { label: '100 g', grams: 100 },
      ],
    });
  });

  it("follows a food's current values", async () => {
    const id = await porridge();
    await database()
      .updateTable('food_nutrients')
      .set({ energy_kcal: 400 })
      .where('food_id', '=', oatsId)
      .execute();

    expect((await as('alice').recipe.get(id)).nutrients.total.energy_kcal).toBe(
      1100,
    );
  });

  it('resolves a nested recipe as a food per 100 g', async () => {
    const breakfast = await create('Breakfast', { servings: 1 });
    await addRecipe(breakfast, await porridge());

    expect((await as('alice').recipe.get(breakfast)).ingredients).toEqual([
      expect.objectContaining({
        kind: 'recipe',
        name: 'Porridge',
        grams: 200,
        per100g: expect.objectContaining({ energy_kcal: 132.5 }),
        nutrients: expect.objectContaining({ energy_kcal: 265 }),
      }),
    ]);
  });

  it('still reads an archived recipe', async () => {
    const id = await porridge();
    await as('alice').recipe.archive(id);

    expect(await as('alice').recipe.get(id)).toMatchObject({ archived: true });
  });

  it("answers not found for anyone else's recipe", async () => {
    const id = await porridge();

    await expect(as('bob').recipe.get(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('recipe.update and recipe.archive', () => {
  it('changes the fields of a live recipe', async () => {
    const id = await porridge();

    await as('alice').recipe.update({
      id,
      name: 'Oat porridge',
      servings: 2,
      cookedWeightG: 700,
      notes: 'Stir',
    });

    expect(await as('alice').recipe.get(id)).toMatchObject({
      name: 'Oat porridge',
      servings: 2,
      cookedWeightG: 700,
      notes: 'Stir',
      portions: [{ label: '1 serving', grams: 350 }, { label: '100 g' }],
    });
  });

  it("answers not found for an archived recipe or anyone else's", async () => {
    const id = await porridge();
    await expect(
      as('bob').recipe.update({ id, name: 'Mine', ...fields }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(as('bob').recipe.archive(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await as('alice').recipe.archive(id);

    await expect(as('alice').recipe.archive(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      as('alice').recipe.update({ id, name: 'Again', ...fields }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('recipe.addIngredient', () => {
  it('appends the ingredient at the grams of its portion', async () => {
    const id = await create('Porridge');
    await addFood(id, milkId);

    const oats = await addFood(id, oatsId, '1 cup', 2);

    expect(oats).toMatchObject({ name: 'Rolled oats', grams: 160 });
    expect(await ingredientNames(id)).toEqual(['Milk', 'Rolled oats']);
  });

  it('refuses a portion the ingredient does not have', async () => {
    const id = await create('Porridge');

    await expect(addFood(id, oatsId, '1 bowl')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it("answers not found for anyone else's food or recipe", async () => {
    const id = await create('Porridge');
    const bobs = await as('bob').recipe.create({ name: 'Curry', ...fields });

    await expect(addFood(id, bobsFoodId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(addRecipe(id, bobs)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      as('bob').recipe.addIngredient({
        recipeId: id,
        ingredient: { kind: 'food', foodId: oatsId },
        portion: '100 g',
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses an archived recipe as the ingredient or the recipe', async () => {
    const id = await create('Breakfast');
    const archived = await porridge();
    await as('alice').recipe.archive(archived);

    await expect(addRecipe(id, archived)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(addFood(archived, oatsId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('refuses a recipe without ingredients', async () => {
    const id = await create('Breakfast');

    await expect(addRecipe(id, await create('Nothing'))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The recipe has no ingredients',
    });
  });

  it('nests a recipe one level', async () => {
    const lasagne = await create('Lasagne');
    const bechamel = await create('Bechamel');
    await addFood(bechamel, milkId);

    await addRecipe(lasagne, bechamel);

    expect(await ingredientNames(lasagne)).toEqual(['Bechamel']);
  });

  it('refuses to nest a recipe two levels deep', async () => {
    const lasagne = await create('Lasagne');
    const ragu = await create('Ragu');
    const stock = await create('Stock');
    await addFood(stock, milkId);
    await addFood(ragu, oatsId);

    await addRecipe(lasagne, ragu);

    await expect(addRecipe(ragu, stock)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('refuses a recipe that already contains one', async () => {
    const lasagne = await create('Lasagne');
    const ragu = await create('Ragu');
    const stock = await create('Stock');
    await addFood(stock, milkId);
    await addRecipe(ragu, stock);

    await expect(addRecipe(lasagne, ragu)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(await ingredientNames(lasagne)).toEqual([]);
  });

  it('refuses a recipe into itself', async () => {
    const id = await porridge();

    await expect(addRecipe(id, id)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('recipe.updateIngredient', () => {
  it('changes the quantity at the same portion', async () => {
    const id = await create('Porridge');
    const oats = await addFood(id, oatsId, '1 cup', 2);

    expect(
      await as('alice').recipe.updateIngredient({ id: oats.id, quantity: 3 }),
    ).toMatchObject({ portionLabel: '1 cup', quantity: 3, grams: 240 });
  });

  it('changes the portion', async () => {
    const id = await create('Porridge');
    const oats = await addFood(id, oatsId, '1 cup', 2);

    expect(
      await as('alice').recipe.updateIngredient({
        id: oats.id,
        portion: '100 g',
      }),
    ).toMatchObject({ portionLabel: '100 g', quantity: 2, grams: 200 });
  });

  it('keeps the saved weight of a portion the food no longer has', async () => {
    const id = await create('Porridge');
    const oats = await addFood(id, oatsId, '1 cup', 2);
    await database()
      .deleteFrom('food_portions')
      .where('food_id', '=', oatsId)
      .execute();

    expect(
      await as('alice').recipe.updateIngredient({ id: oats.id, quantity: 1 }),
    ).toMatchObject({ portionLabel: '1 cup', grams: 80 });
  });

  it("answers not found for anyone else's ingredient", async () => {
    const id = await create('Porridge');
    const oats = await addFood(id, oatsId);

    await expect(
      as('bob').recipe.updateIngredient({ id: oats.id, quantity: 2 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('recipe.removeIngredient', () => {
  it("removes an ingredient, and not from anyone else's recipe", async () => {
    const id = await porridge();
    const [oats] = (await as('alice').recipe.get(id)).ingredients;
    if (!oats) {
      throw new Error('porridge has no oats');
    }

    await expect(
      as('bob').recipe.removeIngredient(oats.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await as('alice').recipe.removeIngredient(oats.id);

    expect(await ingredientNames(id)).toEqual(['Milk']);
  });
});

describe('recipe.reorder', () => {
  it('puts the ingredients in the order given', async () => {
    const id = await porridge();
    const ids = (await as('alice').recipe.get(id)).ingredients.map(
      (ingredient) => ingredient.id,
    );

    await as('alice').recipe.reorder({
      recipeId: id,
      ingredientIds: ids.toReversed(),
    });

    expect(await ingredientNames(id)).toEqual(['Milk', 'Rolled oats']);
  });

  it('refuses a list that is not exactly its ingredients', async () => {
    const id = await porridge();
    const [first = ''] = (await as('alice').recipe.get(id)).ingredients.map(
      (ingredient) => ingredient.id,
    );

    for (const ingredientIds of [[first], [first, first], [first, 'other']]) {
      await expect(
        as('alice').recipe.reorder({ recipeId: id, ingredientIds }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
  });

  it("answers not found for anyone else's recipe", async () => {
    const id = await porridge();

    await expect(
      as('bob').recipe.reorder({ recipeId: id, ingredientIds: [] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('recipe.fromMeal', () => {
  const date = '2026-10-20';

  const logFood = (foodId: string, portion: string, quantity: number) =>
    as('alice').diary.addFood({
      date,
      meal: 'breakfast',
      foodId,
      portion,
      quantity,
    });

  it("makes a recipe of one serving from the meal's entries, in order", async () => {
    await logFood(oatsId, '1 cup', 1);
    await logFood(milkId, '100 g', 2);
    await as('alice').diary.addFood({
      date,
      meal: 'lunch',
      foodId: milkId,
      portion: '100 g',
      quantity: 5,
    });

    const { id, skipped } = await as('alice').recipe.fromMeal({
      date,
      meal: 'breakfast',
      name: ' Breakfast bowl ',
    });

    expect(skipped).toEqual([]);
    const recipe = await as('alice').recipe.get(id);
    expect(recipe).toMatchObject({
      name: 'Breakfast bowl',
      servings: 1,
      cookedWeightG: null,
    });
    expect(
      recipe.ingredients.map(({ name, portionLabel, quantity, grams }) => ({
        name,
        portionLabel,
        quantity,
        grams,
      })),
    ).toEqual([
      { name: 'Rolled oats', portionLabel: '1 cup', quantity: 1, grams: 80 },
      { name: 'Milk', portionLabel: '100 g', quantity: 2, grams: 200 },
    ]);
    expect(recipe.nutrients.perServing.energy_kcal).toBeCloseTo(404);
  });

  it('nests a logged recipe and leaves out quick entries', async () => {
    const child = await porridge();
    await as('alice').diary.addRecipe({
      date,
      meal: 'breakfast',
      recipeId: child,
      servings: 2,
    });
    await as('alice').diary.addQuick({
      date,
      meal: 'breakfast',
      label: 'Coffee',
      nutrients: { totals: { energy_kcal: 40 } },
    });

    const { id, skipped } = await as('alice').recipe.fromMeal({
      date,
      meal: 'breakfast',
      name: 'Brunch',
    });

    expect(skipped).toEqual(['Coffee']);
    expect(await as('alice').recipe.get(id)).toMatchObject({
      ingredients: [
        { kind: 'recipe', recipeId: child, portionLabel: '1 serving' },
      ],
    });
  });

  it('leaves out a recipe that already contains one', async () => {
    const inner = await porridge();
    const outer = await create('Breakfast plate');
    await addRecipe(outer, inner);
    await addFood(outer, oatsId);
    await as('alice').diary.addRecipe({
      date,
      meal: 'breakfast',
      recipeId: outer,
      servings: 1,
    });
    await logFood(milkId, '100 g', 1);

    const { id, skipped } = await as('alice').recipe.fromMeal({
      date,
      meal: 'breakfast',
      name: 'Again',
    });

    expect(skipped).toEqual(['Breakfast plate']);
    expect(await ingredientNames(id)).toEqual(['Milk']);
  });

  it('replaces the converted entries with one serving of the recipe, keeping the rest', async () => {
    await as('alice').diary.addFood({
      date,
      meal: 'breakfast',
      foodId: oatsId,
      portion: '1 cup',
      quantity: 1,
      time: '08:30',
    });
    await logFood(milkId, '100 g', 2);
    await as('alice').diary.addQuick({
      date,
      meal: 'breakfast',
      label: 'Coffee',
      nutrients: { totals: { energy_kcal: 40 } },
    });

    const { id, entry } = await as('alice').recipe.fromMeal({
      date,
      meal: 'breakfast',
      name: 'Porridge',
      replace: true,
    });

    expect(entry).toMatchObject({
      kind: 'recipe',
      recipeId: id,
      label: 'Porridge',
      portionLabel: '1 serving',
      quantity: 1,
      grams: 280,
      time: '08:30',
    });
    expect(entry?.nutrients.energy_kcal).toBeCloseTo(404);
    const breakfast = (await as('alice').diary.day(date)).meals.find(
      ({ meal }) => meal === 'breakfast',
    );
    expect(breakfast?.entries.map(({ label }) => label)).toEqual([
      'Coffee',
      'Porridge',
    ]);
  });

  it('leaves the meal alone unless asked to replace it', async () => {
    await logFood(oatsId, '1 cup', 1);

    const { entry } = await as('alice').recipe.fromMeal({
      date,
      meal: 'breakfast',
      name: 'Oats',
    });

    expect(entry).toBeNull();
    const breakfast = (await as('alice').diary.day(date)).meals.find(
      ({ meal }) => meal === 'breakfast',
    );
    expect(breakfast?.entries.map(({ label }) => label)).toEqual([
      'Rolled oats',
    ]);
  });

  it('refuses a meal with nothing that can be an ingredient', async () => {
    await as('alice').diary.addQuick({
      date,
      meal: 'breakfast',
      label: 'Coffee',
      nutrients: { totals: { energy_kcal: 40 } },
    });

    for (const meal of ['breakfast', 'dinner'] as const) {
      await expect(
        as('alice').recipe.fromMeal({ date, meal, name: 'Nothing' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(await as('alice').recipe.list()).toEqual([]);
  });

  it("never reads anyone else's meal", async () => {
    await logFood(oatsId, '1 cup', 1);

    await expect(
      as('bob').recipe.fromMeal({ date, meal: 'breakfast', name: 'Mine' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
