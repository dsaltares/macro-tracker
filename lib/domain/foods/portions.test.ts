import { describe, expect, it } from 'vitest';
import {
  defaultPortion,
  standardPortions,
  withStandardPortions,
} from './portions.ts';

const serving = { label: '1 serving', grams: 30 };

describe('standardPortions', () => {
  it('are 100 g and 1 g', () => {
    expect(standardPortions).toEqual([
      { label: '100 g', grams: 100 },
      { label: '1 g', grams: 1 },
    ]);
  });
});

describe('withStandardPortions', () => {
  it("follows a food's own portions with 100 g and 1 g", () => {
    expect(withStandardPortions([serving])).toEqual([
      serving,
      ...standardPortions,
    ]);
  });

  it('is 100 g and 1 g for a food without portions', () => {
    expect(withStandardPortions([])).toEqual(standardPortions);
  });

  it('never repeats a standard portion the food already has', () => {
    const ownHundred = { label: '100 g', grams: 100 };

    expect(withStandardPortions([ownHundred, serving])).toEqual([
      ownHundred,
      serving,
      { label: '1 g', grams: 1 },
    ]);
  });
});

describe('defaultPortion', () => {
  it("is a food's first portion", () => {
    expect(defaultPortion([serving, { label: '1 jar', grams: 400 }])).toEqual(
      serving,
    );
  });

  it('is 100 g for a food without portions', () => {
    expect(defaultPortion([])).toEqual({ label: '100 g', grams: 100 });
  });
});
