import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export const aiProviders = ['openai'] as const;

export type AiProvider = (typeof aiProviders)[number];

export const defaultModels = {
  openai: 'gpt-5.4-mini',
} as const satisfies Record<AiProvider, string>;

// The meal estimator runs on this model whatever AI_MODEL says: a tool loop that sends the photos
// on every step costs several calls a meal, and Terra reads plates and calls tools for half of
// Sol's price. Priced in pricing.ts.
export const mealEstimatorModel = 'gpt-6.1-terra';

export type AiSettings = {
  provider?: string | undefined;
  model?: string | undefined;
  apiKey?: string | undefined;
};

const isAiProvider = (provider: string): provider is AiProvider =>
  (aiProviders as readonly string[]).includes(provider);

const providerModels = {
  openai: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
} as const satisfies Record<
  AiProvider,
  (apiKey: string, model: string) => LanguageModel
>;

export const resolveLanguageModel = ({
  provider = process.env.AI_PROVIDER || 'openai',
  model = process.env.AI_MODEL,
  apiKey = process.env.AI_API_KEY,
}: AiSettings = {}): LanguageModel | null => {
  if (!isAiProvider(provider)) {
    throw new Error(
      `AI_PROVIDER is ${provider}; it must be one of ${aiProviders.join(', ')}`,
    );
  }
  if (!apiKey) {
    return null;
  }
  return providerModels[provider](apiKey, model || defaultModels[provider]);
};
