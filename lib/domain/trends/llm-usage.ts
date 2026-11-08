import { addDays, dateAt } from '../dates.ts';
import { datesFrom } from './aggregations.ts';

// A recorded model call, as the trends read it: one step of a request.
export type LlmCallUsage = {
  model: string;
  createdAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};

// Cost is null when no call was priced; `unpricedCalls` are the calls to a model with no price,
// whose cost the total leaves out.
export type LlmUsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  unpricedCalls: number;
};

export type LlmUsageDay = {
  date: string;
  byModel: Record<string, LlmUsageTotals>;
};

export type ModelUsage = LlmUsageTotals & { model: string };

export type LlmUsage = {
  days: LlmUsageDay[];
  models: ModelUsage[];
  totals: LlmUsageTotals;
};

const noUsage: LlmUsageTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: null,
  unpricedCalls: 0,
};

const addCall = (
  totals: LlmUsageTotals,
  { inputTokens, outputTokens, costUsd }: LlmCallUsage,
): LlmUsageTotals => ({
  calls: totals.calls + 1,
  inputTokens: totals.inputTokens + (inputTokens ?? 0),
  outputTokens: totals.outputTokens + (outputTokens ?? 0),
  costUsd: costUsd === null ? totals.costUsd : (totals.costUsd ?? 0) + costUsd,
  unpricedCalls: totals.unpricedCalls + (costUsd === null ? 1 : 0),
});

// The instants that can fall on a date from `from` to `to` in any time zone, a day either side.
export const llmUsageWindow = (from: string, to: string) => ({
  since: `${addDays(from, -1)}T00:00:00.000Z`,
  until: `${addDays(to, 2)}T00:00:00.000Z`,
});

// Each date's calls by model, in the time zone the dates are in; then each model's and every
// call's totals over the range. Models are the costliest first, then the most called.
export const llmUsage = (
  from: string,
  to: string,
  timeZone: string,
  calls: readonly LlmCallUsage[],
): LlmUsage => {
  const days = new Map(
    datesFrom(from, to).map((date) => [
      date,
      {} as Record<string, LlmUsageTotals>,
    ]),
  );
  const models = new Map<string, LlmUsageTotals>();
  let totals = noUsage;
  for (const call of calls) {
    const byModel = days.get(dateAt(call.createdAt, timeZone));
    if (byModel === undefined) {
      continue;
    }
    byModel[call.model] = addCall(byModel[call.model] ?? noUsage, call);
    models.set(call.model, addCall(models.get(call.model) ?? noUsage, call));
    totals = addCall(totals, call);
  }
  return {
    days: [...days].map(([date, byModel]) => ({ date, byModel })),
    models: [...models]
      .map(([model, usage]) => ({ model, ...usage }))
      .sort(
        (a, b) =>
          (b.costUsd ?? 0) - (a.costUsd ?? 0) ||
          b.calls - a.calls ||
          a.model.localeCompare(b.model),
      ),
    totals,
  };
};

const countFormat = new Intl.NumberFormat('en-GB');

export const formatCount = (count: number) => countFormat.format(count);

const usdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

// A request costs a fraction of a cent, so cents alone would show most days as $0.00.
export const formatUsd = (usd: number) => usdFormat.format(usd);
