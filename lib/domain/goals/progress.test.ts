import { describe, expect, it } from 'vitest';
import { nutrientKeys } from '../nutrition/nutrients.ts';
import { goalShare, nutrientProgress, progressOf } from './progress.ts';

describe('progressOf', () => {
  it('is under a target below 90% of it, near up to 110% and over beyond', () => {
    expect(progressOf(1799, 2000, 'target')).toBe('under');
    expect(progressOf(1800, 2000, 'target')).toBe('near');
    expect(progressOf(2200, 2000, 'target')).toBe('near');
    expect(progressOf(2201, 2000, 'target')).toBe('over');
  });

  it('is near an upper limit from 90% of it and over as soon as it passes it', () => {
    expect(progressOf(80, 90, 'upper')).toBe('under');
    expect(progressOf(81, 90, 'upper')).toBe('near');
    expect(progressOf(90, 90, 'upper')).toBe('near');
    expect(progressOf(90.1, 90, 'upper')).toBe('over');
  });

  it('is over a goal of zero with any amount at all', () => {
    expect(progressOf(0, 0, 'target')).toBe('near');
    expect(progressOf(1, 0, 'target')).toBe('over');
  });
});

describe('goalShare', () => {
  it('is the amount as a share of the goal, and none of a goal of zero', () => {
    expect(goalShare(50, 200)).toBe(0.25);
    expect(goalShare(10, 0)).toBeUndefined();
  });
});

describe('nutrientProgress', () => {
  it('lists every nutrient in display order', () => {
    expect(nutrientProgress({}, {}).map(({ key }) => key)).toEqual(
      nutrientKeys,
    );
  });

  it('compares each amount with its goal, by the goal’s kind', () => {
    const rows = nutrientProgress(
      { energy_kcal: 1000, sugars: 100 },
      { energy_kcal: 2000, sugars: 90 },
    );

    expect(rows.find(({ key }) => key === 'energy_kcal')).toEqual({
      key: 'energy_kcal',
      kind: 'target',
      amount: 1000,
      goal: 2000,
      share: 0.5,
      progress: 'under',
    });
    expect(rows.find(({ key }) => key === 'sugars')).toMatchObject({
      kind: 'upper',
      share: 100 / 90,
      progress: 'over',
    });
  });

  it('keeps an amount no entry declared apart from zero, with no progress', () => {
    const rows = nutrientProgress({ iron: 0 }, { iron: 11, vitamin_c: 95 });

    expect(rows.find(({ key }) => key === 'iron')).toMatchObject({
      amount: 0,
      progress: 'under',
    });
    expect(rows.find(({ key }) => key === 'vitamin_c')).toMatchObject({
      amount: undefined,
      goal: 95,
      share: undefined,
      progress: undefined,
    });
    expect(rows.find(({ key }) => key === 'caffeine')).toMatchObject({
      amount: undefined,
      goal: undefined,
    });
  });
});
