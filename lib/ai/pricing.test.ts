import { describe, expect, it } from 'vitest';
import { costOf, longContextTokens } from './pricing.ts';

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

  it('prices a snapshot as the longest model it names', () => {
    const output = {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    };
    expect(costOf('gpt-5.4-pro-2026-03-05', output)).toBeCloseTo(180);
    expect(costOf('gpt-5.4-2026-03-05', output)).toBeCloseTo(15);
  });

  it('prices every model the estimator and label reader have run on', () => {
    const tokens = {
      inputTokens: 100_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    };
    expect(costOf('gpt-6.1-sol', tokens)).toBeCloseTo(0.2);
    expect(costOf('gpt-6.1-terra', tokens)).toBeCloseTo(0.1);
  });

  it('prices a call over the long context threshold at its long rates', () => {
    expect(
      costOf('gpt-6.1-terra', {
        inputTokens: longContextTokens + 1,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBeCloseTo((longContextTokens + 1) * 2e-6);
    expect(
      costOf('gpt-6.1-terra', {
        inputTokens: longContextTokens,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBeCloseTo(longContextTokens * 1e-6);
  });

  it('keeps short rates for a model with no long ones', () => {
    expect(
      costOf('gpt-5.4-mini', {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBeCloseTo(0.75);
  });

  it('has no cost for a model it has no price for, or unknown tokens', () => {
    const tokens = { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 };
    expect(costOf('gpt-6', tokens)).toBeNull();
    expect(costOf('gpt-4o', tokens)).toBeNull();
    expect(
      costOf('gpt-5.4-mini', { ...tokens, outputTokens: null }),
    ).toBeNull();
  });
});
