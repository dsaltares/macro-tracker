import { describe, expect, it } from 'vitest';
import {
  defaultPortion,
  gramsFor,
  isStandardLabel,
  standardPortions,
  withStandardPortions,
} from './portions.ts';

const serving = { label: '1 serving', grams: 30 };

describe('standardPortions', () => {
  it('are 100 g, 1 g and 1 ml weighing a gram', () => {
    expect(standardPortions).toEqual([
      { label: '100 g', grams: 100 },
      { label: '1 g', grams: 1 },
      { label: '1 ml', grams: 1 },
    ]);
  });
});

describe('withStandardPortions', () => {
  it("follows a food's own portions with the standard ones", () => {
    expect(withStandardPortions([serving])).toEqual([
      serving,
      ...standardPortions,
    ]);
  });

  it('is the standard portions for a food without portions', () => {
    expect(withStandardPortions([])).toEqual(standardPortions);
  });

  it('never repeats a standard portion the food already has', () => {
    const ownHundred = { label: '100 g', grams: 100 };

    expect(withStandardPortions([ownHundred, serving])).toEqual([
      ownHundred,
      serving,
      { label: '1 g', grams: 1 },
      { label: '1 ml', grams: 1 },
    ]);
  });

  it("keeps what else a food's own portions carry", () => {
    const stored = { ...serving, id: 'portion-1' };

    expect(withStandardPortions([stored])[0]).toBe(stored);
  });
});

describe('isStandardLabel', () => {
  it('is true for the label of a standard portion only', () => {
    expect(isStandardLabel('1 ml')).toBe(true);
    expect(isStandardLabel('1 scoop')).toBe(false);
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

describe('gramsFor', () => {
  it('multiplies a portion by its quantity', () => {
    expect(gramsFor({ label: '1 scoop', grams: 32 }, 2)).toBe(64);
  });

  it('takes a fraction of a portion', () => {
    expect(gramsFor({ label: '1 tbsp', grams: 15 }, 0.5)).toBe(7.5);
  });

  it('weighs a millilitre as a gram', () => {
    const millilitre = standardPortions.find(({ label }) => label === '1 ml');

    expect(millilitre && gramsFor(millilitre, 250)).toBe(250);
  });
});
