import { describe, expect, it } from 'vitest';
import { formatWeight, weightKgSchema } from './body.ts';

describe('weightKgSchema', () => {
  it.each([20, 72.4, 400])('accepts %s kg', (kg) => {
    expect(weightKgSchema.parse(kg)).toBe(kg);
  });

  it.each([
    [19.9, 'Enter a weight of at least 20 kg.'],
    [400.1, 'Enter a weight of at most 400 kg.'],
    [Number.NaN, 'Enter your weight in kg.'],
  ])('refuses %s kg', (kg, message) => {
    expect(weightKgSchema.safeParse(kg).error?.issues).toEqual([
      expect.objectContaining({ message }),
    ]);
  });
});

describe('formatWeight', () => {
  it.each([
    [72.4, '72.4 kg'],
    [72, '72 kg'],
    [72.46, '72.5 kg'],
    [102.5, '102.5 kg'],
  ])('shows %s as %s', (kg, shown) => {
    expect(formatWeight(kg)).toBe(shown);
  });
});
