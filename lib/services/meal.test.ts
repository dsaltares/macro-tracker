import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { diaryDay } from '../db/diary.ts';
import { type FoodWriteContext, insertFood } from '../db/foods.ts';
import { resolveMealMatches } from '../db/meal-estimator-foods.ts';
import {
  type MealEstimate,
  mealDraft,
  mealDraftToEntries,
} from '../domain/diary/meal-estimate.ts';
import { createCaller } from '../trpc/root.ts';
import type { ServiceContext } from './context.ts';
import { logMeal } from './meal.ts';

const database = migratedDatabasePerTest();

let clock: FoodWriteContext;

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
      ['user-1', 'user-2'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
      })),
    )
    .execute();
});

const date = '2026-10-20';

const contextOf = (userId: string): ServiceContext => ({
  db: database(),
  caller: { userId },
  ...clock,
});

const foodOf = (userId: string, name: string) =>
  insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: userId,
      barcode: null,
      name,
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 160, protein: 5, carbohydrate: 20, fat: 4 },
      portions: [{ label: '1 jar', grams: 250 }],
    },
    clock,
  );

const recipeOf = async (userId: string, foodId: string) => {
  const user = createCaller({ db: database(), caller: { userId }, ...clock });
  const recipeId = await user.recipe.create({
    name: 'Oats bowl',
    servings: 2,
    cookedWeightG: null,
    notes: null,
  });
  await user.recipe.addIngredient({
    recipeId,
    ingredient: { kind: 'food', foodId },
    portion: '1 jar',
    quantity: 2,
  });
  return recipeId;
};

const estimateOf = (foodId: string, recipeId: string): MealEstimate => ({
  items: [
    {
      kind: 'food',
      name: 'Oats',
      grams: 250,
      confidence: 0.9,
      note: null,
      foodId,
      portion: { label: '1 jar', quantity: 1 },
    },
    {
      kind: 'recipe',
      name: 'Oats bowl',
      grams: 250,
      confidence: 0.85,
      note: null,
      recipeId,
      servings: 1,
    },
    {
      kind: 'guess',
      name: 'Honey drizzle',
      grams: 10,
      confidence: 0.5,
      note: 'Hard to tell how much',
      nutrients: { energy_kcal: 30, protein: 0, carbohydrate: 8, fat: 0 },
    },
  ],
  notes: [],
});

const draftFor = async (userId: string, estimate: MealEstimate) =>
  mealDraft(
    estimate,
    await resolveMealMatches({ db: database(), userId }, estimate),
  );

describe('logMeal', () => {
  it('logs a draft of a food, a recipe and a guess as three entries of their kinds, with its totals', async () => {
    const foodId = await foodOf('user-1', 'Overnight oats');
    const recipeId = await recipeOf('user-1', foodId);
    const draft = await draftFor('user-1', estimateOf(foodId, recipeId));

    const logged = await logMeal(contextOf('user-1'), {
      date,
      meal: 'breakfast',
      time: '08:30',
      items: mealDraftToEntries(draft),
    });

    expect(logged).toMatchObject({
      outcome: 'logged',
      entries: [
        { kind: 'food', foodId, label: 'Overnight oats', grams: 250 },
        { kind: 'recipe', recipeId, label: 'Oats bowl', grams: 250 },
        { kind: 'quick', label: 'Honey drizzle', grams: null },
      ],
    });
    const day = await diaryDay(database(), 'user-1', date);
    expect(day).toHaveLength(3);
    expect(
      day.every(({ meal, time }) => meal === 'breakfast' && time === '08:30'),
    ).toBe(true);
    for (const [key, total] of Object.entries(draft.totals)) {
      const logged = day.reduce(
        (sum, { nutrients }) =>
          sum + (nutrients[key as keyof typeof nutrients] ?? 0),
        0,
      );
      expect(logged).toBeCloseTo(total);
    }
  });

  it("writes nothing when an item names another user's food", async () => {
    const ownFoodId = await foodOf('user-1', 'Overnight oats');
    const recipeId = await recipeOf('user-1', ownFoodId);
    const theirFoodId = await foodOf('user-2', 'Their granola');

    const logged = await logMeal(contextOf('user-1'), {
      date,
      meal: 'breakfast',
      time: null,
      items: [
        { kind: 'recipe', recipeId, amount: { servings: 1 } },
        {
          kind: 'quick',
          label: 'Coffee',
          nutrients: { totals: { energy_kcal: 5 } },
        },
        { kind: 'food', foodId: theirFoodId, portion: '1 jar', quantity: 1 },
      ],
    });

    expect(logged).toEqual({ outcome: 'food-not-found', index: 2 });
    expect(await diaryDay(database(), 'user-1', date)).toEqual([]);
    expect(await diaryDay(database(), 'user-2', date)).toEqual([]);
  });

  it("writes nothing when an item names another user's recipe or a portion the food lacks", async () => {
    const ownFoodId = await foodOf('user-1', 'Overnight oats');
    const theirRecipeId = await recipeOf(
      'user-2',
      await foodOf('user-2', 'Their oats'),
    );
    const meal = { date, meal: 'lunch', time: null } as const;

    expect(
      await logMeal(contextOf('user-1'), {
        ...meal,
        items: [
          { kind: 'food', foodId: ownFoodId, portion: '1 jar', quantity: 1 },
          { kind: 'recipe', recipeId: theirRecipeId, amount: { grams: 100 } },
        ],
      }),
    ).toEqual({ outcome: 'recipe-not-found', index: 1 });
    expect(
      await logMeal(contextOf('user-1'), {
        ...meal,
        items: [
          { kind: 'food', foodId: ownFoodId, portion: '1 jar', quantity: 1 },
          { kind: 'food', foodId: ownFoodId, portion: '1 bucket', quantity: 1 },
        ],
      }),
    ).toEqual({ outcome: 'portion-not-found', index: 1 });
    expect(await diaryDay(database(), 'user-1', date)).toEqual([]);
  });
});
