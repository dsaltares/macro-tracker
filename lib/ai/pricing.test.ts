import { describe, expect, it } from 'vitest';
import { costOf } from './pricing.ts';

describe('costOf', () => {
  it('prices input, cached input and output at their own rates', () => {
    expect(
      costOf('gpt-5.4-mini', {
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
        outputTokens: 100_000,
      }),
    ).toBeCloseTo(0.6 * 0.75 + 0.4 * 0.075 + 0.1 * 4.5);
  });

  it('treats unknown cached tokens as none', () => {
    expect(
      costOf('gpt-5.4-mini', {
        inputTokens: 1_000_000,
        cachedInputTokens: null,
        outputTokens: 0,
      }),
    ).toBeCloseTo(0.75);
  });

  it('prices a dated snapshot as its model', () => {
    expect(
      costOf('gpt-5.4-mini-2026-03-17', {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(4.5);
  });

  it('has no cost for a model it has no price for, or unknown tokens', () => {
    const tokens = { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 };
    expect(costOf('gpt-6', tokens)).toBeNull();
    expect(costOf('gpt-5.4', tokens)).toBeNull();
    expect(
      costOf('gpt-5.4-mini', { ...tokens, outputTokens: null }),
    ).toBeNull();
  });
});
