import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import type { LlmCall } from '../ai/llm-calls.ts';
import { insertLlmCall, llmCallRecorder, llmCallsOfRun } from './llm-calls.ts';

const database = migratedDatabasePerTest();

const context = {
  now: () => '2026-11-08T12:00:00.000Z',
  nextId: () => 'call-1',
};

const call: LlmCall = {
  runId: 'run-1',
  purpose: 'meal-estimate',
  step: 2,
  provider: 'openai.responses',
  model: 'gpt-5.4-mini',
  inputTokens: 12_000,
  cachedInputTokens: 8_000,
  outputTokens: 600,
  reasoningTokens: 400,
  costUsd: 0.0063,
  finishReason: 'tool-calls',
  response: null,
  reasoning: 'Rice and chicken.',
  toolCalls: [
    {
      toolName: 'searchFoods',
      input: { query: 'rice' },
      output: { foods: [] },
    },
  ],
  error: null,
  durationMs: 2100,
};

beforeEach(async () => {
  await database()
    .insertInto('users')
    .values({ id: 'user-1', name: 'user-1', email: 'user-1@example.test' })
    .execute();
});

describe('llm calls', () => {
  it('writes a call with its tool calls as JSON', async () => {
    await insertLlmCall(database(), 'user-1', call, context);

    expect(await llmCallsOfRun(database(), 'run-1')).toEqual([
      {
        id: 'call-1',
        run_id: 'run-1',
        user_id: 'user-1',
        purpose: 'meal-estimate',
        step: 2,
        provider: 'openai.responses',
        model: 'gpt-5.4-mini',
        input_tokens: 12_000,
        cached_input_tokens: 8_000,
        output_tokens: 600,
        reasoning_tokens: 400,
        cost_usd: 0.0063,
        finish_reason: 'tool-calls',
        response: null,
        reasoning: 'Rice and chicken.',
        tool_calls: JSON.stringify(call.toolCalls),
        error: null,
        duration_ms: 2100,
        created_at: '2026-11-08T12:00:00.000Z',
      },
    ]);
  });

  it("goes with the user's account", async () => {
    await insertLlmCall(database(), 'user-1', call, context);

    await database().deleteFrom('users').where('id', '=', 'user-1').execute();

    expect(await llmCallsOfRun(database(), 'run-1')).toEqual([]);
  });

  it('logs and drops a call it cannot write', async () => {
    const logger = pino({ enabled: false });
    const error = vi.spyOn(logger, 'error');
    const record = llmCallRecorder({
      db: database(),
      userId: 'no-such-user',
      logger,
    });

    await expect(record(call)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', purpose: 'meal-estimate' }),
      'A model call could not be recorded',
    );
    expect(await llmCallsOfRun(database(), 'run-1')).toEqual([]);
  });
});
