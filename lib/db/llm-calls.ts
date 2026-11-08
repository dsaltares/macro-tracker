import type { Kysely, Selectable } from 'kysely';
import type { Logger } from 'pino';
import { v7 } from 'uuid';
import type { LlmCall, RecordLlmCall } from '../ai/llm-calls.ts';
import type { FoodWriteContext } from './foods.ts';
import type { Database, LlmCallsTable } from './schema.ts';

const systemContext: FoodWriteContext = {
  now: () => new Date().toISOString(),
  nextId: v7,
};

export const insertLlmCall = async (
  db: Kysely<Database>,
  userId: string,
  call: LlmCall,
  { now, nextId }: FoodWriteContext = systemContext,
) => {
  await db
    .insertInto('llm_calls')
    .values({
      id: nextId(),
      run_id: call.runId,
      user_id: userId,
      purpose: call.purpose,
      step: call.step,
      provider: call.provider,
      model: call.model,
      input_tokens: call.inputTokens,
      cached_input_tokens: call.cachedInputTokens,
      output_tokens: call.outputTokens,
      reasoning_tokens: call.reasoningTokens,
      cost_usd: call.costUsd,
      finish_reason: call.finishReason,
      response: call.response,
      reasoning: call.reasoning,
      tool_calls:
        call.toolCalls === null ? null : JSON.stringify(call.toolCalls),
      error: call.error,
      duration_ms: call.durationMs,
      created_at: now(),
    })
    .execute();
};

// What the model calls of a request are recorded through. A record that cannot be written is
// logged and dropped: it never fails the estimate or the label it describes.
export const llmCallRecorder =
  ({
    db,
    userId,
    logger,
    context = systemContext,
  }: {
    db: Kysely<Database>;
    userId: string;
    logger: Logger;
    context?: FoodWriteContext;
  }): RecordLlmCall =>
  async (call) => {
    try {
      await insertLlmCall(db, userId, call, context);
    } catch (error) {
      logger.error(
        { err: error, runId: call.runId, purpose: call.purpose },
        'A model call could not be recorded',
      );
    }
  };

export type LlmCallRow = Selectable<LlmCallsTable>;

export const llmCallsOfRun = (db: Kysely<Database>, runId: string) =>
  db
    .selectFrom('llm_calls')
    .selectAll()
    .where('run_id', '=', runId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();

// A user's calls made in `[since, until)`, as the trends read them.
export const llmCallsOverQuery = (
  db: Kysely<Database>,
  userId: string,
  { since, until }: { since: string; until: string },
) =>
  db
    .selectFrom('llm_calls')
    .select([
      'model',
      'created_at as createdAt',
      'input_tokens as inputTokens',
      'output_tokens as outputTokens',
      'cost_usd as costUsd',
    ])
    .where('user_id', '=', userId)
    .where('created_at', '>=', since)
    .where('created_at', '<', until);
