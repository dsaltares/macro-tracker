import type { Meal } from '../diary/entries.ts';
import { nutrients } from '../nutrition/nutrients.ts';
import type { NutrientVector } from '../nutrition/vector.ts';

export type CsvCell = string | number | null;

const needsQuoting = /[",\r\n]/;

const csvDecimals = 4;

const csvNumber = (value: number) => {
  const factor = 10 ** csvDecimals;
  return String(Math.round(value * factor) / factor + 0);
};

export const csvCell = (cell: CsvCell) => {
  if (cell === null) {
    return '';
  }
  const text = typeof cell === 'number' ? csvNumber(cell) : cell;
  return needsQuoting.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (rows: readonly (readonly CsvCell[])[]) =>
  rows.map((row) => `${row.map(csvCell).join(',')}\r\n`).join('');

export type DiaryCsvEntry = {
  date: string;
  meal: Meal;
  time: string | null;
  label: string;
  grams: number | null;
  nutrients: NutrientVector;
};

export const diaryCsvHeader: readonly string[] = [
  'date',
  'meal',
  'time',
  'label',
  'grams',
  ...nutrients.map(({ key, unit }) => `${key} (${unit})`),
];

export const diaryCsv = (entries: readonly DiaryCsvEntry[]) =>
  toCsv([
    diaryCsvHeader,
    ...entries.map((entry) => [
      entry.date,
      entry.meal,
      entry.time,
      entry.label,
      entry.grams,
      ...nutrients.map(({ key }) => entry.nutrients[key] ?? null),
    ]),
  ]);

export type WeightCsvRow = { date: string; value: number };

export const weightsCsv = (weights: readonly WeightCsvRow[]) =>
  toCsv([
    ['date', 'weight_kg'],
    ...weights.map(({ date, value }) => [date, value]),
  ]);
