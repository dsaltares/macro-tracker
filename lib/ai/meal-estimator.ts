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
} from '../domain/diary/meal-estimate.ts';
import type { Portion } from '../domain/foods/portions.ts';
import type { Source } from '../domain/foods/sources.ts';
import { getLogger } from '../logger.ts';
import {
  mealInstructions,
  mealRequest,
  previousAnswer,
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

export const createMealEstimator = ({
  model,
}: {
  model: LanguageModel;
}): MealEstimator => ({
  estimateMeal: async (request) => {
    try {
      const { output } = await generateText({
        model,
        output: mealEstimateOutput,
        instructions: mealInstructions,
        tools: toolsOver(request.foods),
        stopWhen: stepCountIs(maxEstimatorSteps),
        messages: messagesOf(request),
      });
      return { estimated: true, estimate: output };
    } catch (error) {
      return {
        estimated: false,
        failure: failureOf(error),
        message: messageOf(error),
      };
    }
  },
});
