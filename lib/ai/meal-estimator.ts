import {
  generateText,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  tool,
} from 'ai';
import { z } from 'zod';
import type { FoodSummary } from '../db/food-search.ts';
import type { RecipeSummary } from '../db/recipes.ts';
import {
  type MealDraft,
  type MealEstimate,
  mealEstimateSchema,
  type ResolvedMatches,
  unresolvedItems,
} from '../domain/diary/meal-estimate.ts';
import type { Portion } from '../domain/foods/portions.ts';
import type { Source } from '../domain/foods/sources.ts';
import { getLogger } from '../logger.ts';
import {
  mealInstructions,
  mealRequest,
  previousAnswer,
  repairRequest,
  revisionRequest,
} from './prompts/meal.ts';
import {
  type AiFailure,
  failureOf,
  messageOf,
  strictOutput,
} from './structured-output.ts';

export type MealEstimatorSearch = {
  foods: FoodSummary[];
  recipes: RecipeSummary[];
};

export type MealEstimatorFood = {
  id: string;
  name: string;
  brand: string | null;
  quantityLabel: string | null;
  source: Source;
  portions: Portion[];
};

export type MealEstimatorFoods = {
  searchFoods: (query: string) => Promise<MealEstimatorSearch>;
  getFood: (id: string) => Promise<MealEstimatorFood | null>;
  resolveMatches: (estimate: MealEstimate) => Promise<ResolvedMatches>;
};

export type PreviousEstimate = { draft: MealDraft; feedback: string };

export type MealEstimateRequest = {
  photos: readonly Uint8Array[];
  description: string | null;
  foods: MealEstimatorFoods;
  previous?: PreviousEstimate;
};

export type MealEstimateResult =
  | { estimated: true; estimate: MealEstimate }
  | { estimated: false; failure: AiFailure; message: string };

export type EstimateMeal = (
  request: MealEstimateRequest,
) => Promise<MealEstimateResult>;

export type MealEstimator = { estimateMeal: EstimateMeal };

export const maxEstimatorSteps = 10;

export const maxRepairSteps = 5;

const mealEstimateOutput = strictOutput('meal_estimate', mealEstimateSchema);

const logger = getLogger('meal-estimator');

const toolsOver = (foods: MealEstimatorFoods) => ({
  searchFoods: tool({
    description:
      "Search the user's own foods and recipes and the reference foods by name. Each food has its source, its energy and macros per 100 g and its default portion; each recipe has its servings and cooked weight.",
    inputSchema: z.object({
      query: z.string().describe('A food name, such as "basmati rice"'),
    }),
    execute: ({ query }) => {
      logger.debug({ tool: 'searchFoods', query }, 'meal estimator tool call');
      return foods.searchFoods(query);
    },
  }),
  getFood: tool({
    description:
      'Read one food found by searchFoods, with every portion it can be logged in and its weight in grams.',
    inputSchema: z.object({ id: z.string().describe("The food's id") }),
    execute: async ({ id }) => {
      logger.debug({ tool: 'getFood', id }, 'meal estimator tool call');
      return (await foods.getFood(id)) ?? { found: false };
    },
  }),
});

const messagesOf = ({
  photos,
  description,
  previous,
}: MealEstimateRequest): ModelMessage[] => {
  const meal: ModelMessage = {
    role: 'user',
    content: [
      { type: 'text', text: mealRequest(description) },
      ...photos.map((photo) => ({
        type: 'file' as const,
        data: photo,
        mediaType: 'image',
      })),
    ],
  };
  if (previous === undefined) {
    return [meal];
  }
  return [
    meal,
    { role: 'assistant', content: previousAnswer(previous.draft) },
    { role: 'user', content: revisionRequest(previous.feedback) },
  ];
};

const estimateWith = (
  model: LanguageModel,
  { foods }: MealEstimateRequest,
  messages: ModelMessage[],
  maxSteps: number,
) =>
  generateText({
    model,
    output: mealEstimateOutput,
    instructions: mealInstructions,
    tools: toolsOver(foods),
    stopWhen: stepCountIs(maxSteps),
    messages,
  });

export const createMealEstimator = ({
  model,
}: {
  model: LanguageModel;
}): MealEstimator => ({
  estimateMeal: async (request) => {
    try {
      const messages = messagesOf(request);
      const first = await estimateWith(
        model,
        request,
        messages,
        maxEstimatorSteps,
      );
      const unresolved = unresolvedItems(
        first.output,
        await request.foods.resolveMatches(first.output),
      );
      if (unresolved.length === 0) {
        return { estimated: true, estimate: first.output };
      }
      logger.debug(
        { unresolved: unresolved.map(({ name }) => name) },
        'meal estimator repair round',
      );
      const repaired = await estimateWith(
        model,
        request,
        [
          ...messages,
          ...first.response.messages,
          { role: 'user', content: repairRequest(unresolved) },
        ],
        maxRepairSteps,
      );
      return { estimated: true, estimate: repaired.output };
    } catch (error) {
      return {
        estimated: false,
        failure: failureOf(error),
        message: messageOf(error),
      };
    }
  },
});
