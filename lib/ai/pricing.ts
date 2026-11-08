// US dollars per million tokens, from the provider's price list. A model not listed here is
// recorded with no cost; add it when AI_MODEL moves to it.
export type ModelPrice = {
  input: number;
  cachedInput: number;
  output: number;
};

export const modelPrices: Record<string, ModelPrice> = {
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
};

export type TokenCounts = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

const perToken = 1 / 1_000_000;

// A snapshot such as gpt-5.4-mini-2026-03-17 is priced as the model it is a snapshot of.
const priceOf = (modelId: string): ModelPrice | null => {
  const exact = modelPrices[modelId];
  if (exact !== undefined) {
    return exact;
  }
  const base = Object.keys(modelPrices)
    .filter((name) => modelId.startsWith(`${name}-`))
    .sort((a, b) => b.length - a.length)[0];
  return base === undefined ? null : (modelPrices[base] ?? null);
};

// The provider counts reasoning tokens among the output tokens and cached input tokens among
// the input tokens, so each is billed once.
export const costOf = (
  modelId: string,
  { inputTokens, cachedInputTokens, outputTokens }: TokenCounts,
): number | null => {
  const price = priceOf(modelId);
  if (price === null || inputTokens === null || outputTokens === null) {
    return null;
  }
  const cached = Math.min(cachedInputTokens ?? 0, inputTokens);
  return (
    ((inputTokens - cached) * price.input +
      cached * price.cachedInput +
      outputTokens * price.output) *
    perToken
  );
};
