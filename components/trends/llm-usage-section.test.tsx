import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  LlmUsageSection,
  llmUsageLoadFailed,
} from '@/components/trends/llm-usage-section';
import { insertLlmCall } from '@/lib/db/llm-calls';
import { addDays, formatDay, localDateOf } from '@/lib/domain/dates';
import { serveApi } from '@/test/api';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const to = localDateOf(new Date());
const from = addDays(to, -29);

let ids = 0;

// Noon on a date in the browser's time zone, the one the section asks in.
const noonOn = (date: string) => new Date(`${date}T12:00:00`).toISOString();

const recordCall = (
  date: string,
  {
    model = 'gpt-5.4-mini',
    inputTokens = 12_000,
    outputTokens = 600,
    costUsd = 0.0063 as number | null,
  } = {},
) =>
  insertLlmCall(
    api.database(),
    'user-1',
    {
      runId: `run-${date}`,
      purpose: 'meal-estimate',
      step: 0,
      provider: 'openai.responses',
      model,
      inputTokens,
      cachedInputTokens: 0,
      outputTokens,
      reasoningTokens: 0,
      costUsd,
      finishReason: 'stop',
      response: null,
      reasoning: null,
      toolCalls: null,
      error: null,
      durationMs: 1000,
    },
    { now: () => noonOn(date), nextId: () => `call-${++ids}` },
  );

const render = () =>
  renderUi(<LlmUsageSection from={from} to={to} rangeLabel="30 days" />, {
    wrap: api.wrap,
  });

const section = () => screen.getByRole('region', { name: 'AI usage' });

const shown = (term: string) =>
  within(section())
    .getAllByRole('term')
    .find((candidate) => candidate.textContent === term)?.nextElementSibling
    ?.textContent;

const rowOf = (model: string) =>
  within(screen.getByRole('table', { name: 'Usage by model' }))
    .getByRole('rowheader', { name: model })
    .closest('tr');

describe('LlmUsageSection', () => {
  it('sums up the calls, tokens and cost of the range, by model', async () => {
    await recordCall(to);
    await recordCall(addDays(to, -1), {
      inputTokens: 8_000,
      outputTokens: 400,
      costUsd: 0.0037,
    });
    await recordCall(addDays(to, -2), {
      model: 'other-model',
      inputTokens: 1_000,
      outputTokens: 50,
      costUsd: null,
    });
    await recordCall(addDays(from, -1), { costUsd: 5 });
    render();

    expect(await screen.findByRole('figure')).toHaveAccessibleName(
      `From ${formatDay(from)} to ${formatDay(to)}: 3 model calls to gpt-5.4-mini, other-model, ` +
        'reading 21,000 input tokens and writing 1,050 output tokens, at a cost of $0.01.',
    );
    expect(shown('Calls')).toBe('3');
    expect(shown('Input tokens')).toBe('21,000');
    expect(shown('Output tokens')).toBe('1,050');
    expect(shown('Cost')).toBe('$0.01');
    expect(
      screen.getByText('The cost leaves out 1 call to a model with no price.'),
    ).toBeInTheDocument();
    expect(rowOf('gpt-5.4-mini')).toHaveTextContent(
      'gpt-5.4-mini220,0001,000$0.01',
    );
    expect(rowOf('other-model')).toHaveTextContent('other-model11,00050–');
  });

  it('charts cost until another measure is chosen', async () => {
    await recordCall(to);
    const { user } = render();

    expect(await screen.findByRole('button', { name: 'Cost' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Output tokens' }));
    expect(
      screen.getByRole('button', { name: 'Output tokens' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cost' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('says when the range has no AI requests', async () => {
    render();

    expect(
      await screen.findByText('No AI requests in the last 30 days.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('says when the usage could not be loaded', async () => {
    api.fails('trends.llmUsage');
    render();

    expect(await screen.findByText(llmUsageLoadFailed)).toBeInTheDocument();
  });
});
