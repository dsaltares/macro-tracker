import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { insertFood } from '../db/foods.ts';
import { mealEstimatorFoods } from '../db/meal-estimator-foods.ts';
import type {
  MatchedFood,
  MealDraft,
  MealEstimate,
} from '../domain/diary/meal-estimate.ts';
import {
  createMealEstimator,
  type MealEstimatorFoods,
  maxEstimatorSteps,
  maxRepairSteps,
} from './meal-estimator.ts';

const debug = vi.hoisted(() => vi.fn());

vi.mock('../logger.ts', () => ({ getLogger: () => ({ debug }) }));

const database = migratedDatabasePerTest();

const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const estimate: MealEstimate = {
  items: [
    {
      kind: 'food',
      name: 'Rolled oats',
      grams: 40,
      confidence: 0.9,
      note: null,
      foodId: 'oats',
      portion: null,
    },
  ],
  notes: [],
};

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const answer = (value: unknown): LanguageModelV4GenerateResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
  warnings: [],
});

let toolCalls = 0;

const callingTool = (
  toolName: string,
  input: unknown,
): LanguageModelV4GenerateResult => ({
  content: [
    {
      type: 'tool-call',
      toolCallId: `call-${++toolCalls}`,
      toolName,
      input: JSON.stringify(input),
    },
  ],
  finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
  usage,
  warnings: [],
});

const answering = (...steps: LanguageModelV4GenerateResult[]) =>
  new MockLanguageModelV4({ doGenerate: steps });

const failingWith = (error: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw error;
    },
  });

const matched: MatchedFood = { name: 'Found', nutrients: {}, portions: [] };

const matchingEvery = (ids: string[]) =>
  new Map(ids.map((id) => [id, matched]));

const resolvingAll: MealEstimatorFoods['resolveMatches'] = async ({
  items,
}) => ({
  foods: matchingEvery(
    items.flatMap((item) => (item.kind === 'food' ? [item.foodId] : [])),
  ),
  recipes: matchingEvery(
    items.flatMap((item) => (item.kind === 'recipe' ? [item.recipeId] : [])),
  ),
});

const noFoods: MealEstimatorFoods = {
  searchFoods: async () => ({ foods: [], recipes: [] }),
  getFood: async () => null,
  resolveMatches: resolvingAll,
};

const resolvingOnly = (...ids: string[]): MealEstimatorFoods => ({
  ...noFoods,
  resolveMatches: async () => ({
    foods: matchingEvery(ids),
    recipes: matchingEvery(ids),
  }),
});

const madeUp: MealEstimate = {
  items: [
    estimate.items[0] as MealEstimate['items'][number],
    {
      kind: 'food',
      name: 'Salată Starter Plus',
      grams: 240,
      confidence: 0.6,
      note: null,
      foodId: 'made-up',
      portion: null,
    },
    {
      kind: 'recipe',
      name: 'Dressing',
      grams: 20,
      confidence: 0.6,
      note: null,
      recipeId: 'made-up-recipe',
      servings: null,
    },
  ],
  notes: [],
};

const repaired: MealEstimate = {
  items: [
    estimate.items[0] as MealEstimate['items'][number],
    {
      kind: 'guess',
      name: 'Salată Starter Plus',
      grams: 240,
      confidence: 0.8,
      note: 'From the label: 81 kcal per 100 g',
      nutrients: {
        energy_kcal: 194,
        protein: 5.8,
        carbohydrate: 14.2,
        fat: 12.7,
      },
    },
  ],
  notes: [],
};

const oats = {
  id: 'oats',
  name: 'Rolled oats',
  brand: null,
  quantityLabel: null,
  source: 'ciqual' as const,
  portions: [{ label: '1 cup', grams: 80 }],
};

const toolResultsOf = (model: MockLanguageModelV4, call: number) =>
  JSON.stringify(
    model.doGenerateCalls[call]?.prompt.filter(({ role }) => role === 'tool'),
  );

beforeEach(() => {
  toolCalls = 0;
  debug.mockClear();
});

describe('createMealEstimator', () => {
  it('searches, reads a food’s portions and answers the estimate', async () => {
    const foods: MealEstimatorFoods = {
      searchFoods: vi.fn(async () => ({ foods: [], recipes: [] })),
      getFood: vi.fn(async () => oats),
      resolveMatches: resolvingAll,
    };
    const model = answering(
      callingTool('searchFoods', { query: 'oats' }),
      callingTool('getFood', { id: 'oats' }),
      answer(estimate),
    );

    const result = await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: 'Porridge',
      foods,
    });

    expect(result).toEqual({ estimated: true, estimate });
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(foods.searchFoods).toHaveBeenCalledExactlyOnceWith('oats');
    expect(foods.getFood).toHaveBeenCalledExactlyOnceWith('oats');
    expect(toolResultsOf(model, 2)).toContain('1 cup');
  });

  it('hands the model the instructions, the description, every photo and the tools', async () => {
    const model = answering(answer(estimate));

    await createMealEstimator({ model }).estimateMeal({
      photos: [photo, photo],
      description: 'Porridge with honey',
      foods: noFoods,
    });

    const [call] = model.doGenerateCalls;
    expect(call?.prompt[0]).toMatchObject({ role: 'system' });
    expect(call?.prompt.at(-1)).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: expect.stringContaining('Porridge with honey') },
        { type: 'file', data: { type: 'data', data: photo } },
        { type: 'file', data: { type: 'data', data: photo } },
      ],
    });
    expect(call?.tools?.map(({ name }) => name)).toEqual([
      'searchFoods',
      'getFood',
    ]);
    expect(call?.responseFormat).toMatchObject({
      type: 'json',
      name: 'meal_estimate',
    });
  });

  it('sends its items as anyOf, since strict outputs refuse oneOf', async () => {
    const model = answering(answer(estimate));

    await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: null,
      foods: noFoods,
    });

    const format = model.doGenerateCalls[0]?.responseFormat;
    const schema = JSON.stringify(format?.type === 'json' && format.schema);
    expect(schema).toContain('"anyOf"');
    expect(schema).not.toContain('oneOf');
  });

  it('logs each tool call with its query and never the photo', async () => {
    const model = answering(
      callingTool('searchFoods', { query: 'oats' }),
      answer(estimate),
    );

    await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: null,
      foods: noFoods,
    });

    expect(debug).toHaveBeenCalledExactlyOnceWith(
      { tool: 'searchFoods', query: 'oats' },
      'meal estimator tool call',
    );
  });

  it('sends back the foods and recipes it named that do not exist, and answers the repaired estimate', async () => {
    const model = answering(
      answer(madeUp),
      callingTool('searchFoods', { query: 'salad' }),
      answer(repaired),
    );

    const result = await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: null,
      foods: resolvingOnly('oats'),
    });

    expect(result).toEqual({ estimated: true, estimate: repaired });
    const repair = model.doGenerateCalls[1]?.prompt ?? [];
    expect(repair.slice(-2).map(({ role }) => role)).toEqual([
      'assistant',
      'user',
    ]);
    const request = JSON.stringify(repair.at(-1)?.content);
    expect(request).toContain('Salată Starter Plus: foodId made-up');
    expect(request).toContain('Dressing: recipeId made-up-recipe');
    expect(request).not.toContain('Rolled oats');
    expect(repair[1]).toMatchObject({
      role: 'user',
      content: [{ type: 'text' }, { type: 'file' }],
    });
  });

  it('answers a repaired estimate that still names a missing food, for the draft to flag', async () => {
    const model = answering(answer(madeUp), answer(madeUp));

    const result = await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: null,
      foods: resolvingOnly('oats'),
    });

    expect(result).toEqual({ estimated: true, estimate: madeUp });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('answers unreadable when the repair round passes its step limit', async () => {
    const model = answering(
      answer(madeUp),
      ...Array.from({ length: maxRepairSteps + 1 }, () =>
        callingTool('searchFoods', { query: 'salad' }),
      ),
    );

    const result = await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: null,
      foods: resolvingOnly('oats'),
    });

    expect(result).toMatchObject({ estimated: false, failure: 'unreadable' });
    expect(model.doGenerateCalls).toHaveLength(1 + maxRepairSteps);
  });

  it('answers unreadable past the step limit', async () => {
    const model = answering(
      ...Array.from({ length: maxEstimatorSteps + 1 }, () =>
        callingTool('searchFoods', { query: 'oats' }),
      ),
    );

    const result = await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: null,
      foods: noFoods,
    });

    expect(result).toMatchObject({ estimated: false, failure: 'unreadable' });
    expect(model.doGenerateCalls).toHaveLength(maxEstimatorSteps);
  });

  it('answers unreadable when the estimate does not fit its schema', async () => {
    const model = answering(answer({ items: [{ kind: 'food' }], notes: [] }));

    const result = await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: null,
      foods: noFoods,
    });

    expect(result).toMatchObject({ estimated: false, failure: 'unreadable' });
  });

  it('sends the draft as its earlier answer and the feedback to revise it by', async () => {
    const draft: MealDraft = {
      items: [
        {
          kind: 'food',
          name: 'Rolled oats',
          grams: 80,
          confidence: 0.9,
          unsure: false,
          note: null,
          nutrients: { energy_kcal: 304 },
          foodId: 'oats',
          portionLabel: '1 cup',
          quantity: 1,
        },
        {
          kind: 'guess',
          name: 'Honey',
          grams: 10,
          confidence: 0.5,
          unsure: true,
          note: null,
          nutrients: { energy_kcal: 30, carbohydrate: 8 },
          unresolved: false,
        },
      ],
      totals: { energy_kcal: 334, carbohydrate: 8 },
      notes: [],
    };
    const model = answering(answer(estimate));

    await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: 'Porridge',
      foods: noFoods,
      previous: { draft, feedback: 'There was no honey' },
    });

    const prompt = model.doGenerateCalls[0]?.prompt ?? [];
    expect(prompt.map(({ role }) => role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    const [, meal, earlier, revision] = prompt;
    expect(meal).toMatchObject({
      content: [{ type: 'text' }, { type: 'file' }],
    });
    const earlierText = JSON.stringify(earlier?.content);
    expect(earlierText).toContain('1 cup');
    expect(earlierText).toContain('Honey');
    expect(earlierText).toContain('carbohydrate');
    expect(JSON.stringify(revision?.content)).toContain('There was no honey');
  });

  it.each([
    [429, 'rate-limited'],
    [400, 'rejected'],
    [503, 'unavailable'],
  ] as const)(
    'answers %s from the provider as %s',
    async (statusCode, failure) => {
      const model = failingWith(
        new APICallError({
          message: `Provider responded ${statusCode}`,
          url: 'https://ai.example.test/v1/responses',
          requestBodyValues: { image: 'the photo' },
          statusCode,
          isRetryable: false,
        }),
      );

      const result = await createMealEstimator({ model }).estimateMeal({
        photos: [photo],
        description: null,
        foods: noFoods,
      });

      expect(result).toEqual({
        estimated: false,
        failure,
        message: `Provider responded ${statusCode}`,
      });
    },
  );
});

describe('the meal estimator over the database', () => {
  const clock = {
    nextId: () => crypto.randomUUID(),
    now: () => '2026-10-20T12:00:00.000Z',
  };

  const userFood = (ownerUserId: string, name: string) =>
    insertFood(
      database(),
      {
        source: 'user',
        owner_user_id: ownerUserId,
        barcode: null,
        name,
        brand: null,
        quantity_label: null,
        nutrients: { energy_kcal: 380, protein: 13, carbohydrate: 60, fat: 7 },
        portions: [],
      },
      clock,
    );

  beforeEach(async () => {
    await database()
      .insertInto('users')
      .values([
        { id: 'alice', name: 'alice', email: 'alice@example.test' },
        { id: 'bob', name: 'bob', email: 'bob@example.test' },
      ])
      .execute();
    await userFood('alice', 'Alice’s overnight oats');
    await userFood('bob', 'Bob’s overnight oats');
  });

  it('searches as the caller, finding their foods and none of another user’s', async () => {
    const model = answering(
      callingTool('searchFoods', { query: 'overnight oats' }),
      answer({ items: [], notes: [] }),
    );

    await createMealEstimator({ model }).estimateMeal({
      photos: [photo],
      description: null,
      foods: mealEstimatorFoods({ db: database(), userId: 'alice' }),
    });

    const results = toolResultsOf(model, 1);
    expect(results).toContain('Alice’s overnight oats');
    expect(results).not.toContain('Bob’s overnight oats');
  });
});
