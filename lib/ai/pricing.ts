// US dollars per million tokens, standard tier, from OpenAI's price list
// (developers.openai.com/api/docs/pricing, read 2026-11-08). A model not listed here is recorded
// with no cost; add it when a model moves to it.
export type ModelPrice = {
  input: number;
  cachedInput: number;
  output: number;
};

// A call over longContextTokens of input is billed at the model's longContext rates, for the
// whole call, when the model has them.
export type ModelPricing = ModelPrice & { longContext?: ModelPrice };

export const longContextTokens = 272_000;

const price = (
  input: number,
  cachedInput: number,
  output: number,
  longContext?: ModelPrice,
): ModelPricing => ({
  input,
  cachedInput,
  output,
  ...(longContext === undefined ? {} : { longContext }),
});

const long = (input: number, cachedInput: number, output: number) => ({
  input,
  cachedInput,
  output,
});

// A model with no cached rate (the pro models) bills cached input as input.
export const modelPrices: Record<string, ModelPricing> = {
  'gpt-6-astra': price(10, 1, 50, long(20, 2, 75)),
  'gpt-6.1-sol': price(2, 0.1, 10, long(4, 0.2, 15)),
  'gpt-6.1-terra': price(1, 0.05, 5, long(2, 0.1, 7.5)),
  'gpt-6-sol': price(2, 0.2, 10, long(4, 0.4, 15)),
  'gpt-6-luna': price(0.1, 0.01, 0.5, long(0.2, 0.02, 0.75)),
  'gpt-5.6-sol': price(4, 0.4, 20, long(8, 0.8, 30)),
  'gpt-5.6-terra': price(2, 0.2, 12, long(4, 0.4, 18)),
  'gpt-5.6-luna': price(0.2, 0.02, 1.2, long(0.4, 0.04, 1.8)),
  'gpt-5.5': price(5, 0.5, 30, long(10, 1, 45)),
  'gpt-5.5-pro': price(30, 30, 180, long(60, 60, 270)),
  'gpt-5.4': price(2.5, 0.25, 15, long(5, 0.5, 22.5)),
  'gpt-5.4-pro': price(30, 30, 180, long(60, 60, 270)),
  'gpt-5.4-mini': price(0.75, 0.075, 4.5),
  'gpt-5.4-nano': price(0.2, 0.02, 1.25),
  'gpt-5-mini': price(0.25, 0.025, 2),
  'gpt-5-nano': price(0.05, 0.005, 0.4),
};

export type TokenCounts = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

const perToken = 1 / 1_000_000;

// A snapshot such as gpt-5.4-mini-2026-03-17 is priced as the model it is a snapshot of.
const pricingOf = (modelId: string): ModelPricing | null => {
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
  const pricing = pricingOf(modelId);
  if (pricing === null || inputTokens === null || outputTokens === null) {
    return null;
  }
  const rates =
    inputTokens > longContextTokens && pricing.longContext !== undefined
      ? pricing.longContext
      : pricing;
  const cached = Math.min(cachedInputTokens ?? 0, inputTokens);
  return (
    ((inputTokens - cached) * rates.input +
      cached * rates.cachedInput +
      outputTokens * rates.output) *
    perToken
  );
};
