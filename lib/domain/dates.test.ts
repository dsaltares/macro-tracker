import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isDate, localDateOf, today } from './dates.ts';

describe('localDateOf', () => {
  it('is the local calendar day, zero-padded', () => {
    expect(localDateOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

const at = (instant: string) => ({ now: () => instant });

describe('isDate', () => {
  it('is true for a calendar day as YYYY-MM-DD', () => {
    expect(isDate('2026-10-20')).toBe(true);
    expect(isDate('2028-02-29')).toBe(true);
  });

  it('is false for a day the calendar does not have', () => {
    expect(isDate('2026-02-29')).toBe(false);
    expect(isDate('2026-13-01')).toBe(false);
    expect(isDate('2026-04-31')).toBe(false);
  });

  it('is false for anything but YYYY-MM-DD', () => {
    expect(isDate('2026-1-5')).toBe(false);
    expect(isDate('20/10/2026')).toBe(false);
    expect(isDate('2026-10-20T00:00:00Z')).toBe(false);
    expect(isDate('')).toBe(false);
  });
});

describe('today', () => {
  it("is the user's local day, not the UTC one", () => {
    const instant = at('2026-10-20T23:30:00.000Z');

    expect(today(instant, 'UTC')).toBe('2026-10-20');
    expect(today(instant, 'Europe/Madrid')).toBe('2026-10-21');
    expect(today(instant, 'America/Los_Angeles')).toBe('2026-10-20');
    expect(today(at('2026-10-20T08:00:00.000Z'), 'America/Los_Angeles')).toBe(
      '2026-10-20',
    );
    expect(today(at('2026-10-20T06:00:00.000Z'), 'America/Los_Angeles')).toBe(
      '2026-10-19',
    );
  });

  it('spans the 23 hours of a day the clocks go forward', () => {
    expect(today(at('2026-03-28T22:59:59.999Z'), 'Europe/Madrid')).toBe(
      '2026-03-28',
    );
    expect(today(at('2026-03-28T23:00:00.000Z'), 'Europe/Madrid')).toBe(
      '2026-03-29',
    );
    expect(today(at('2026-03-29T21:59:59.999Z'), 'Europe/Madrid')).toBe(
      '2026-03-29',
    );
    expect(today(at('2026-03-29T22:00:00.000Z'), 'Europe/Madrid')).toBe(
      '2026-03-30',
    );
  });

  it('spans the 25 hours of a day the clocks go back', () => {
    expect(today(at('2026-10-24T22:00:00.000Z'), 'Europe/Madrid')).toBe(
      '2026-10-25',
    );
    expect(today(at('2026-10-25T22:59:59.999Z'), 'Europe/Madrid')).toBe(
      '2026-10-25',
    );
    expect(today(at('2026-10-25T23:00:00.000Z'), 'Europe/Madrid')).toBe(
      '2026-10-26',
    );
  });

  it('refuses a time zone that does not exist', () => {
    expect(() => today(at('2026-10-20T12:00:00.000Z'), 'Mars/Olympus')).toThrow(
      RangeError,
    );
  });
});

describe('addDays', () => {
  it('moves to a later or earlier day', () => {
    expect(addDays('2026-10-20', 1)).toBe('2026-10-21');
    expect(addDays('2026-10-20', -1)).toBe('2026-10-19');
    expect(addDays('2026-10-20', 0)).toBe('2026-10-20');
  });

  it('crosses months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('moves one day at a time across a change of clocks', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-10-26', -1)).toBe('2026-10-25');
  });
});

describe('daysBetween', () => {
  it('counts whole days from one date to another', () => {
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7);
    expect(daysBetween('2026-10-27', '2026-10-20')).toBe(-7);
    expect(daysBetween('2026-10-20', '2026-10-20')).toBe(0);
  });

  it('counts a day the clocks change as one day', () => {
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });

  it('undoes addDays', () => {
    expect(daysBetween('2026-10-20', addDays('2026-10-20', 400))).toBe(400);
  });
});
