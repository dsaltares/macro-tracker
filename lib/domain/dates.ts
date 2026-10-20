export type Clock = { now: () => string };

const twoDigits = (value: number) => String(value).padStart(2, '0');

export const localDateOf = (instant: Date) =>
  `${instant.getFullYear()}-${twoDigits(instant.getMonth() + 1)}-${twoDigits(instant.getDate())}`;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

const utcMidnight = (date: string) =>
  Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );

const fromUtcMidnight = (milliseconds: number) =>
  new Date(milliseconds).toISOString().slice(0, 10);

export const isDate = (value: string) =>
  datePattern.test(value) && fromUtcMidnight(utcMidnight(value)) === value;

export const today = (clock: Clock, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(clock.now()));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const addDays = (date: string, days: number) =>
  fromUtcMidnight(utcMidnight(date) + days * millisecondsPerDay);

export const daysBetween = (from: string, to: string) =>
  Math.round((utcMidnight(to) - utcMidnight(from)) / millisecondsPerDay);

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatDay = (date: string) =>
  dayFormat.format(new Date(utcMidnight(date)));

const dayMonthFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const formatDayMonth = (date: string) =>
  dayMonthFormat.format(new Date(utcMidnight(date)));

const monthYearFormat = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatMonthYear = (date: string) =>
  monthYearFormat.format(new Date(utcMidnight(date)));
