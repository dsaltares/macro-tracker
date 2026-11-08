import type { Kysely } from 'kysely';
import { costOf } from '../../ai/pricing.ts';

type LlmCallTokens = {
  id: string;
  model: string;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
};

// Calls recorded before their model had a price were recorded with no cost; price the ones whose
// tokens are known now that it has one.
export const up = async (db: Kysely<unknown>) => {
  const calls = db.withTables<{ llm_calls: LlmCallTokens }>();
  const unpriced = await calls
    .selectFrom('llm_calls')
    .select([
      'id',
      'model',
      'input_tokens',
      'cached_input_tokens',
      'output_tokens',
    ])
    .where('cost_usd', 'is', null)
    .where('input_tokens', 'is not', null)
    .where('output_tokens', 'is not', null)
    .execute();
  for (const call of unpriced) {
    const cost = costOf(call.model, {
      inputTokens: call.input_tokens,
      cachedInputTokens: call.cached_input_tokens,
      outputTokens: call.output_tokens,
    });
    if (cost !== null) {
      await calls
        .updateTable('llm_calls')
        .set({ cost_usd: cost })
        .where('id', '=', call.id)
        .execute();
    }
  }
};

// The costs stay: they are what the calls cost.
export const down = async () => {};
