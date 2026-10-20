import { describe, expect, it } from 'vitest';
import {
  adherence,
  averageOf,
  type DailyTotal,
  dailyTotals,
  datesFrom,
  type GoalDay,
  isWithinEnergyGoal,
  loggedAverage,
  nutrientAverages,
  rollingWindowStart,
  trendDays,
} from './aggregations.ts';

const logged = (date: string, energy_kcal: number): DailyTotal => ({
  date,
  logged: true,
  totals: { energy_kcal },
});

const unlogged = (date: string): DailyTotal => ({
  date,
  logged: false,
  totals: {},
});

const withGoal = (day: DailyTotal, goalKcal: number | null): GoalDay => ({
  ...day,
  goal: goalKcal === null ? null : { energy_kcal: goalKcal },
});

describe('datesFrom', () => {
  it('lists every date from the first to the last, both included, across a month', () => {
    expect(datesFrom('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('is the one date of a range of a day', () => {
    expect(datesFrom('2026-10-20', '2026-10-20')).toEqual(['2026-10-20']);
  });
});

describe('rollingWindowStart', () => {
  it('is six days before, so the window spans seven', () => {
    expect(rollingWindowStart('2026-10-20')).toBe('2026-10-14');
  });
});

describe('averageOf', () => {
  it('has none without vectors', () => {
    expect(averageOf([])).toBeNull();
  });

  it('divides each nutrient by every vector, counting an absent one as zero', () => {
    expect(
      averageOf([
        { energy_kcal: 2000, iron: 9 },
        { energy_kcal: 1000, protein: 60 },
      ]),
    ).toEqual({ energy_kcal: 1500, iron: 4.5, protein: 30 });
  });
});

describe('dailyTotals', () => {
  it('sums each date of the range, flagging the dates with no entries and ignoring those outside it', () => {
    expect(
      dailyTotals('2026-10-19', '2026-10-21', [
        { date: '2026-10-21', nutrients: { energy_kcal: 500, protein: 20 } },
        { date: '2026-10-19', nutrients: { energy_kcal: 300 } },
        { date: '2026-10-21', nutrients: { energy_kcal: 250, fat: 10 } },
        { date: '2026-10-22', nutrients: { energy_kcal: 900 } },
      ]),
    ).toEqual([
      { date: '2026-10-19', logged: true, totals: { energy_kcal: 300 } },
      { date: '2026-10-20', logged: false, totals: {} },
      {
        date: '2026-10-21',
        logged: true,
        totals: { energy_kcal: 750, protein: 20, fat: 10 },
      },
    ]);
  });

  it('counts a date logged even when its entries add up to nothing', () => {
    expect(
      dailyTotals('2026-10-20', '2026-10-20', [
        { date: '2026-10-20', nutrients: {} },
      ]),
    ).toEqual([{ date: '2026-10-20', logged: true, totals: {} }]);
  });
});

describe('loggedAverage', () => {
  it('averages over the logged days alone', () => {
    expect(
      loggedAverage([
        logged('2026-10-19', 1800),
        unlogged('2026-10-20'),
        logged('2026-10-21', 2200),
      ]),
    ).toEqual({ energy_kcal: 2000 });
  });

  it('has none without a logged day', () => {
    expect(loggedAverage([unlogged('2026-10-20')])).toBeNull();
  });
});

describe('trendDays', () => {
  it('averages each day with the six before it, reaching back before the range and skipping the days with no entries', () => {
    const entries = [
      { date: '2026-10-08', nutrients: { energy_kcal: 9000 } },
      { date: '2026-10-09', nutrients: { energy_kcal: 1400 } },
      { date: '2026-10-12', nutrients: { energy_kcal: 2000 } },
      { date: '2026-10-15', nutrients: { energy_kcal: 2600 } },
    ];

    expect(trendDays('2026-10-15', '2026-10-17', entries)).toEqual([
      {
        date: '2026-10-15',
        logged: true,
        totals: { energy_kcal: 2600 },
        rollingAverage: { energy_kcal: 2000 },
      },
      {
        date: '2026-10-16',
        logged: false,
        totals: {},
        rollingAverage: { energy_kcal: 2300 },
      },
      {
        date: '2026-10-17',
        logged: false,
        totals: {},
        rollingAverage: { energy_kcal: 2300 },
      },
    ]);
  });

  it('has no rolling average for a day with no logged day in its window', () => {
    expect(trendDays('2026-10-20', '2026-10-20', [])).toEqual([
      {
        date: '2026-10-20',
        logged: false,
        totals: {},
        rollingAverage: null,
      },
    ]);
  });
});

describe('isWithinEnergyGoal', () => {
  it('is within 10% of the goal either way, the bounds included', () => {
    expect(isWithinEnergyGoal(1800, 2000)).toBe(true);
    expect(isWithinEnergyGoal(2200, 2000)).toBe(true);
    expect(isWithinEnergyGoal(1799, 2000)).toBe(false);
    expect(isWithinEnergyGoal(2201, 2000)).toBe(false);
  });
});

describe('adherence', () => {
  it('is the share of logged days with a kcal goal that land within it', () => {
    expect(
      adherence([
        withGoal(logged('2026-10-17', 2000), 2000),
        withGoal(logged('2026-10-18', 2500), 2000),
        withGoal(logged('2026-10-19', 1900), 2000),
        withGoal(logged('2026-10-20', 1000), 2000),
        withGoal(unlogged('2026-10-21'), 2000),
        withGoal(logged('2026-10-22', 2000), null),
        { ...logged('2026-10-23', 2000), goal: { protein: 120 } },
      ]),
    ).toBe(0.5);
  });

  it('counts a logged day without energy as zero kcal', () => {
    expect(
      adherence([
        {
          date: '2026-10-20',
          logged: true,
          totals: {},
          goal: { energy_kcal: 2000 },
        },
      ]),
    ).toBe(0);
  });

  it('has none without a logged day that has a kcal goal', () => {
    expect(adherence([])).toBeNull();
    expect(adherence([withGoal(unlogged('2026-10-20'), 2000)])).toBeNull();
    expect(adherence([withGoal(logged('2026-10-20', 2000), null)])).toBeNull();
  });
});

describe('nutrientAverages', () => {
  it('averages the logged days and their goals, counting every day of the range', () => {
    expect(
      nutrientAverages([
        withGoal(logged('2026-10-18', 1800), 2000),
        withGoal(unlogged('2026-10-19'), 5000),
        withGoal(logged('2026-10-20', 2400), 2200),
        withGoal(logged('2026-10-21', 2100), null),
      ]),
    ).toEqual({
      days: 4,
      loggedDays: 3,
      average: { energy_kcal: 2100 },
      goal: { energy_kcal: 2100 },
    });
  });

  it('has neither an average nor a goal without a logged day', () => {
    expect(nutrientAverages([withGoal(unlogged('2026-10-20'), 2000)])).toEqual({
      days: 1,
      loggedDays: 0,
      average: null,
      goal: null,
    });
  });
});
