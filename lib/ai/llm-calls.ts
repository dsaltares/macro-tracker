import type { LanguageModel, StepResult, ToolSet } from 'ai';
import { costOf } from './pricing.ts';

export const llmCallPurposes = [
  'meal-estimate',
  'meal-revision',
  'meal-repair',
  'label-reading',
] as const;

export type LlmCallPurpose = (typeof llmCallPurposes)[number];

export type LlmToolCall = {
  toolName: string;
  input: unknown;
  output: unknown;
};

// One call to the model: what it was asked for, what it used and answered. Never the prompt,
// so never a photo or the user's description.
export type LlmCall = {
  runId: string;
  purpose: LlmCallPurpose;
  step: number;
  provider: string;
  model: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
  finishReason: string | null;
  response: string | null;
  reasoning: string | null;
  toolCalls: LlmToolCall[] | null;
  error: string | null;
  durationMs: number | null;
};

// Kept out of the way of the answer: a recorder never throws, and the call is not waited on
// longer than it takes to hand the record over.
export type RecordLlmCall = (call: LlmCall) => Promise<void>;

export const ignoreLlmCalls: RecordLlmCall = async () => {};

const orNull = <T>(value: T | undefined) => value ?? null;

const textOrNull = (text: string | undefined) =>
  text === undefined || text === '' ? null : text;

const toolCallsOf = <TOOLS extends ToolSet>(
  step: StepResult<TOOLS>,
): LlmToolCall[] | null => {
  if (step.toolCalls.length === 0) {
    return null;
  }
  const outputs = new Map<string, unknown>(
    step.toolResults.map(({ toolCallId, output }) => [toolCallId, output]),
  );
  return step.toolCalls.map(({ toolCallId, toolName, input }) => ({
    toolName,
    input,
    output: outputs.get(toolCallId) ?? null,
  }));
};

export const llmCallOfStep = <TOOLS extends ToolSet>(
  { runId, purpose }: { runId: string; purpose: LlmCallPurpose },
  step: StepResult<TOOLS>,
): LlmCall => {
  const { usage } = step;
  const tokens = {
    inputTokens: orNull(usage.inputTokens),
    cachedInputTokens: orNull(usage.inputTokenDetails.cacheReadTokens),
    outputTokens: orNull(usage.outputTokens),
  };
  return {
    runId,
    purpose,
    step: step.stepNumber,
    provider: step.model.provider,
    model: step.model.modelId,
    ...tokens,
    reasoningTokens: orNull(usage.outputTokenDetails.reasoningTokens),
    costUsd: costOf(step.model.modelId, tokens),
    finishReason: step.finishReason,
    response: textOrNull(step.text),
    reasoning: textOrNull(step.reasoningText),
    toolCalls: toolCallsOf(step),
    error: null,
    durationMs: orNull(step.performance.responseTimeMs),
  };
};

// A call that failed before it answered, or a run whose last answer could not be read: its
// tokens are not known, so it costs nothing here, though the provider may still bill them.
export const failedLlmCall = (
  {
    runId,
    purpose,
    step,
    provider,
    model,
  }: {
    runId: string;
    purpose: LlmCallPurpose;
    step: number;
    provider: string;
    model: string;
  },
  error: string,
): LlmCall => ({
  runId,
  purpose,
  step,
  provider,
  model,
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  costUsd: null,
  finishReason: 'error',
  response: null,
  reasoning: null,
  toolCalls: null,
  error,
  durationMs: null,
});

export const modelInfoOf = (model: LanguageModel) =>
  typeof model === 'string'
    ? { provider: 'gateway', model }
    : { provider: model.provider, model: model.modelId };
