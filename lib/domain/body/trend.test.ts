import { describe, expect, it } from 'vitest';
import {
  formatWeeklyRate,
  pointsInRange,
  type TrendPoint,
  trendRanges,
  weeklyRate,
  weightTrend,
} from './trend.ts';

const range = (id: (typeof trendRanges)[number]['id']) => {
  const found = trendRanges.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`No range ${id}`);
  }
  return found;
};

const point = (date: string, trend: number): TrendPoint => ({
  date,
  weight: trend,
  trend,
});

describe('weightTrend', () => {
  it('is empty without weights', () => {
    expect(weightTrend([])).toEqual([]);
  });

  it('starts at the first weight and moves a tenth of the way to each next one for every day since the one before', () => {
    const trend = weightTrend([
      { date: '2026-01-15', value: 82 },
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-05', value: 79.1 },
      { date: '2026-01-02', value: 81 },
    ]);

    expect(trend.map(({ date, weight }) => [date, weight])).toEqual([
      ['2026-01-01', 80],
      ['2026-01-02', 81],
      ['2026-01-05', 79.1],
      ['2026-01-15', 82],
    ]);
    expect(trend.map(({ trend }) => trend)).toEqual([
      80,
      expect.closeTo(80.1, 10),
      expect.closeTo(79.829, 10),
      expect.closeTo(81.243_019_106_5, 10),
    ]);
  });

  it('weighs a weight after a gap as if it had been logged on each day of it', () => {
    const daily = weightTrend([
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-02', value: 90 },
      { date: '2026-01-03', value: 90 },
      { date: '2026-01-04', value: 90 },
      { date: '2026-01-05', value: 90 },
      { date: '2026-01-06', value: 90 },
      { date: '2026-01-07', value: 90 },
      { date: '2026-01-08', value: 90 },
    ]);
    const afterAWeek = weightTrend([
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-08', value: 90 },
    ]);

    expect(afterAWeek.at(-1)?.trend).toBeCloseTo(daily.at(-1)?.trend ?? 0, 10);
  });
});

describe('weeklyRate', () => {
  it('is the change in the trend from the first point to the last, per week', () => {
    expect(
      weeklyRate([
        point('2026-01-01', 80),
        point('2026-01-05', 79),
        point('2026-01-15', 80.2),
      ]),
    ).toBeCloseTo(0.1, 10);
  });

  it('is negative while the trend falls', () => {
    expect(
      weeklyRate([point('2026-01-01', 80), point('2026-01-08', 79.5)]),
    ).toBeCloseTo(-0.5, 10);
  });

  it.each([
    ['no points', []],
    ['one point', [point('2026-01-01', 80)]],
    [
      'points under a week apart',
      [point('2026-01-01', 80), point('2026-01-07', 79)],
    ],
  ])('is null with %s', (_, points) => {
    expect(weeklyRate(points)).toBeNull();
  });
});

describe('pointsInRange', () => {
  const points = [
    point('2025-01-01', 85),
    point('2025-12-01', 82),
    point('2026-01-02', 81),
    point('2026-01-31', 80),
  ];

  it.each([
    ['30d', ['2026-01-02', '2026-01-31']],
    ['90d', ['2025-12-01', '2026-01-02', '2026-01-31']],
    ['1y', ['2025-12-01', '2026-01-02', '2026-01-31']],
    ['all', ['2025-01-01', '2025-12-01', '2026-01-02', '2026-01-31']],
  ] as const)('keeps the days of %s up to today', (id, dates) => {
    expect(
      pointsInRange(points, range(id), '2026-01-31').map(({ date }) => date),
    ).toEqual(dates);
  });

  it('counts today as the last day of the range', () => {
    expect(
      pointsInRange(points, range('30d'), '2026-02-01').map(({ date }) => date),
    ).toEqual(['2026-01-31']);
  });
});

describe('formatWeeklyRate', () => {
  it.each([
    [-0.43, '-0.4 kg a week'],
    [0.25, '+0.3 kg a week'],
    [-0.04, '0 kg a week'],
    [0, '0 kg a week'],
  ])('shows %s as %s', (kgPerWeek, shown) => {
    expect(formatWeeklyRate(kgPerWeek)).toBe(shown);
  });
});
