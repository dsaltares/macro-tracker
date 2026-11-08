import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatUsd,
  type LlmCallUsage,
  llmUsage,
  llmUsageWindow,
} from './llm-usage.ts';

const call = (overrides: Partial<LlmCallUsage>): LlmCallUsage => ({
  model: 'gpt-5.4-mini',
  createdAt: '2026-10-20T12:00:00.000Z',
  inputTokens: 1000,
  outputTokens: 100,
  costUsd: 0.01,
  ...overrides,
});

describe('llmUsageWindow', () => {
  it('reaches a day either side of the range', () => {
    expect(llmUsageWindow('2026-10-01', '2026-10-31')).toEqual({
      since: '2026-09-30T00:00:00.000Z',
      until: '2026-11-02T00:00:00.000Z',
    });
  });
});

describe('llmUsage', () => {
  it('has a day for every date and no totals without calls', () => {
    expect(llmUsage('2026-10-19', '2026-10-20', 'UTC', [])).toEqual({
      days: [
        { date: '2026-10-19', byModel: {} },
        { date: '2026-10-20', byModel: {} },
      ],
      models: [],
      totals: {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: null,
        unpricedCalls: 0,
      },
    });
  });

  it('sums each date by model, and each model and every call over the range', () => {
    const usage = llmUsage('2026-10-19', '2026-10-20', 'UTC', [
      call({ createdAt: '2026-10-19T08:00:00.000Z' }),
      call({ createdAt: '2026-10-20T08:00:00.000Z' }),
      call({
        createdAt: '2026-10-20T09:00:00.000Z',
        inputTokens: 3000,
        outputTokens: 300,
        costUsd: 0.02,
      }),
      call({
        model: 'other',
        inputTokens: 500,
        outputTokens: null,
        costUsd: null,
      }),
    ]);

    expect(usage.days[0]).toEqual({
      date: '2026-10-19',
      byModel: {
        'gpt-5.4-mini': {
          calls: 1,
          inputTokens: 1000,
          outputTokens: 100,
          costUsd: 0.01,
          unpricedCalls: 0,
        },
      },
    });
    expect(usage.days[1]?.byModel).toEqual({
      'gpt-5.4-mini': {
        calls: 2,
        inputTokens: 4000,
        outputTokens: 400,
        costUsd: 0.03,
        unpricedCalls: 0,
      },
      other: {
        calls: 1,
        inputTokens: 500,
        outputTokens: 0,
        costUsd: null,
        unpricedCalls: 1,
      },
    });
    expect(usage.models.map(({ model }) => model)).toEqual([
      'gpt-5.4-mini',
      'other',
    ]);
    expect(usage.totals).toEqual({
      calls: 4,
      inputTokens: 5500,
      outputTokens: 500,
      costUsd: expect.closeTo(0.04),
      unpricedCalls: 1,
    });
  });

  it('puts a call on the date it falls on in the time zone, leaving out those outside the range', () => {
    const calls = [
      call({ createdAt: '2026-10-18T23:30:00.000Z' }),
      call({ createdAt: '2026-10-20T22:30:00.000Z' }),
    ];
    const calledOn = (timeZone: string) =>
      llmUsage('2026-10-19', '2026-10-20', timeZone, calls).days.map(
        ({ byModel }) => byModel['gpt-5.4-mini']?.calls ?? 0,
      );

    expect(calledOn('UTC')).toEqual([0, 1]);
    expect(calledOn('Europe/Madrid')).toEqual([1, 0]);
  });

  it('counts no tokens for a call that reported none', () => {
    expect(
      llmUsage('2026-10-20', '2026-10-20', 'UTC', [
        call({ inputTokens: null, outputTokens: null, costUsd: null }),
      ]).totals,
    ).toEqual({
      calls: 1,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      unpricedCalls: 1,
    });
  });

  it('orders models by cost, then by calls, then by name', () => {
    const usage = llmUsage('2026-10-20', '2026-10-20', 'UTC', [
      call({ model: 'b', costUsd: null }),
      call({ model: 'a', costUsd: null }),
      call({ model: 'c', costUsd: null }),
      call({ model: 'c', costUsd: null }),
      call({ model: 'd', costUsd: 0.5 }),
    ]);

    expect(usage.models.map(({ model }) => model)).toEqual([
      'd',
      'c',
      'a',
      'b',
    ]);
  });
});

describe('formatCount and formatUsd', () => {
  it('groups thousands, and shows a cost to a hundredth of a cent', () => {
    expect(formatCount(1_234_567)).toBe('1,234,567');
    expect(formatUsd(0.006_34)).toBe('$0.0063');
    expect(formatUsd(12.5)).toBe('$12.50');
  });
});
