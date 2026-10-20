import { describe, expect, it } from 'vitest';
import { nutrientKeys } from '../nutrition/nutrients.ts';
import { csvCell, diaryCsv, diaryCsvHeader, toCsv, weightsCsv } from './csv.ts';

describe('csvCell', () => {
  it('leaves a plain value as it is', () => {
    expect(csvCell('Oat milk')).toBe('Oat milk');
  });

  it.each([
    ['a comma', 'Rice, cooked', '"Rice, cooked"'],
    ['a quote', 'The "good" bread', '"The ""good"" bread"'],
    ['a line break', 'Soup\nwith bread', '"Soup\nwith bread"'],
    ['a carriage return', 'Soup\rwith bread', '"Soup\rwith bread"'],
  ])('quotes a value with %s', (_, value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it('writes nothing for a missing value', () => {
    expect(csvCell(null)).toBe('');
  });

  it('writes a number to at most four decimals', () => {
    expect(csvCell(0.1 + 0.2)).toBe('0.3');
    expect(csvCell(1.234_567)).toBe('1.2346');
    expect(csvCell(120)).toBe('120');
  });

  it('never writes a negative zero', () => {
    expect(csvCell(-0.000_01)).toBe('0');
  });
});

describe('toCsv', () => {
  it('ends every row with CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, null],
      ]),
    ).toBe('a,b\r\n1,\r\n');
  });
});

describe('diaryCsv', () => {
  it('writes one row per entry under a column for every nutrient', () => {
    const csv = diaryCsv([
      {
        date: '2026-10-20',
        meal: 'breakfast',
        time: '08:15',
        label: 'Porridge, with honey',
        grams: 250,
        nutrients: { energy_kcal: 230.5, protein: 8, caffeine: 0 },
      },
      {
        date: '2026-10-20',
        meal: 'snack',
        time: null,
        label: 'Biscuits',
        grams: null,
        nutrients: { energy_kcal: 140 },
      },
    ]);

    const [header, porridge, biscuits, end] = csv.split('\r\n');
    expect(header).toBe(diaryCsvHeader.join(','));
    expect(header).toMatch(
      /^date,meal,time,label,grams,energy_kcal \(kcal\),protein \(g\),/,
    );
    expect(header).toMatch(/,selenium \(µg\),.*,caffeine \(mg\)$/);
    expect(diaryCsvHeader).toHaveLength(5 + nutrientKeys.length);
    expect(porridge).toBe(
      `2026-10-20,breakfast,08:15,"Porridge, with honey",250,230.5,8${','.repeat(nutrientKeys.length - 2)}0`,
    );
    expect(biscuits).toBe(
      `2026-10-20,snack,,Biscuits,,140${','.repeat(nutrientKeys.length - 1)}`,
    );
    expect(end).toBe('');
  });

  it('writes the header alone without entries', () => {
    expect(diaryCsv([])).toBe(`${diaryCsvHeader.join(',')}\r\n`);
  });
});

describe('weightsCsv', () => {
  it('writes a date and a weight per row', () => {
    expect(
      weightsCsv([
        { date: '2026-10-19', value: 72.4 },
        { date: '2026-10-20', value: 72.1 },
      ]),
    ).toBe('date,weight_kg\r\n2026-10-19,72.4\r\n2026-10-20,72.1\r\n');
  });
});
