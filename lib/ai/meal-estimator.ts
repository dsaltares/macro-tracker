import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { z } from 'zod';
import type { FoodSummary } from '../db/food-search.ts';
import type { RecipeSummary } from '../db/recipes.ts';
import {
  type MealDraft,
  type MealEstimate,
  type MealEstimateProgress,
  mealEstimateSchema,
  type ResolvedMatches,
  unresolvedItems,
} from '../domain/diary/meal-estimate.ts';
import type { Portion } from '../domain/foods/portions.ts';
import type { Source } from '../domain/foods/sources.ts';
import { getLogger } from '../logger.ts';
import {
  failedLlmCall,
  ignoreLlmCalls,
  type LlmCallPurpose,
  llmCallOfStep,
  modelInfoOf,
  type RecordLlmCall,
} from './llm-calls.ts';
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
  // Aborted when the browser goes away, so the model stops spending on an answer nobody reads.
  signal?: AbortSignal;
  // Told what the estimator is doing as it does it; never told anything about the photos.
  onProgress?: (progress: MealEstimateProgress) => void;
  // Told every call to the model, with its tokens, cost, answer and tool calls.
  recordCall?: RecordLlmCall;
};

type Report = (progress: MealEstimateProgress) => void;

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

const toolsOver = (foods: MealEstimatorFoods, report: Report) => ({
  searchFoods: tool({
    description:
      "Search the user's own foods and recipes and the reference foods by name. Each food has its source, its energy and macros per 100 g and its default portion; each recipe has its servings and cooked weight.",
    inputSchema: z.object({
      query: z.string().describe('A food name, such as "basmati rice"'),
    }),
    execute: ({ query }) => {
      logger.debug({ tool: 'searchFoods', query }, 'meal estimator tool call');
      report({ kind: 'searching', query });
      return foods.searchFoods(query);
    },
  }),
  getFood: tool({
    description:
      'Read one food found by searchFoods, with every portion it can be logged in and its weight in grams.',
    inputSchema: z.object({ id: z.string().describe("The food's id") }),
    execute: async ({ id }) => {
      logger.debug({ tool: 'getFood', id }, 'meal estimator tool call');
      const food = await foods.getFood(id);
      if (food === null) {
        return { found: false };
      }
      report({ kind: 'reading', name: food.name });
      return food;
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

// OpenAI keeps a reasoning model's thinking to itself, but sends a summary of it when asked.
// Every step resends the instructions, the photos and the steps before it, so one cache key for
// every estimate keeps them on the servers that cached that prefix, billed at the cached rate.
// Other providers ignore the options.
const openAiOptions = {
  openai: { reasoningSummary: 'auto', promptCacheKey: 'meal-estimator' },
};

const ignoreErrors = () => {};

type Run = {
  runId: string;
  purpose: LlmCallPurpose;
  recordCall: RecordLlmCall;
};

// Streamed rather than generated so the reasoning summary and each step reach the browser as
// they happen. An error mid-stream is thrown, as generateText would, for failureOf to map,
// once the call that failed is recorded.
const estimateWith = async (
  model: LanguageModel,
  request: MealEstimateRequest,
  report: Report,
  messages: ModelMessage[],
  maxSteps: number,
  run: Run,
) => {
  let steps = 0;
  try {
    return await streamWith(model, request, report, messages, maxSteps, {
      ...run,
      recordCall: (call) => {
        steps += 1;
        return run.recordCall(call);
      },
    });
  } catch (error) {
    await run.recordCall(
      failedLlmCall(
        { ...run, step: steps, ...modelInfoOf(model) },
        messageOf(error),
      ),
    );
    throw error;
  }
};

const streamWith = async (
  model: LanguageModel,
  { foods, signal }: MealEstimateRequest,
  report: Report,
  messages: ModelMessage[],
  maxSteps: number,
  { runId, purpose, recordCall }: Run,
) => {
  const result = streamText({
    model,
    output: mealEstimateOutput,
    instructions: mealInstructions,
    tools: toolsOver(foods, report),
    stopWhen: stepCountIs(maxSteps),
    messages,
    providerOptions: openAiOptions,
    onError: ignoreErrors,
    onStepEnd: (step) => recordCall(llmCallOfStep({ runId, purpose }, step)),
    ...(signal === undefined ? {} : { abortSignal: signal }),
  });
  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      throw part.error;
    }
    if (part.type === 'reasoning-delta' && part.text !== '') {
      report({ kind: 'thinking', text: part.text });
    } else if (part.type === 'text-start') {
      report({ kind: 'answering' });
    }
  }
  const [output, response] = await Promise.all([
    result.output,
    result.response,
  ]);
  return { output, messages: response.messages };
};

const ignoreProgress: Report = () => {};

export const createMealEstimator = ({
  model,
}: {
  model: LanguageModel;
}): MealEstimator => ({
  estimateMeal: async (request) => {
    try {
      const messages = messagesOf(request);
      const report = request.onProgress ?? ignoreProgress;
      const run = {
        runId: crypto.randomUUID(),
        recordCall: request.recordCall ?? ignoreLlmCalls,
      };
      const first = await estimateWith(
        model,
        request,
        report,
        messages,
        maxEstimatorSteps,
        {
          ...run,
          purpose:
            request.previous === undefined ? 'meal-estimate' : 'meal-revision',
        },
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
      report({ kind: 'checking', names: unresolved.map(({ name }) => name) });
      const repaired = await estimateWith(
        model,
        request,
        report,
        [
          ...messages,
          ...first.messages,
          { role: 'user', content: repairRequest(unresolved) },
        ],
        maxRepairSteps,
        { ...run, purpose: 'meal-repair' },
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
