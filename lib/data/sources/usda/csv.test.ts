import { describe, expect, it } from 'vitest';
import { csvRecords, csvRows } from './csv.ts';

async function* chunksOf(...chunks: string[]) {
  yield* chunks;
}

const rowsOf = async (...chunks: string[]) =>
  Array.fromAsync(csvRows(chunksOf(...chunks)));

describe('csvRows', () => {
  it('splits quoted and unquoted fields', async () => {
    expect(await rowsOf('"a","b",c\n1,"",3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('keeps separators, newlines and doubled quotes inside quotes', async () => {
    expect(
      await rowsOf(
        '"Pillsbury, rolls","large (about 6-1/2"" dia)","two\nlines"\n',
      ),
    ).toEqual([['Pillsbury, rolls', 'large (about 6-1/2" dia)', 'two\nlines']]);
  });

  it('reads a row split across chunks anywhere, even between doubled quotes', async () => {
    expect(await rowsOf('"a"', '"b","c', '",', 'd\n"e"')).toEqual([
      ['a"b', 'c', 'd'],
      ['e'],
    ]);
  });

  it('reads CRLF line endings and a last line without one', async () => {
    expect(await rowsOf('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads an empty input as no rows', async () => {
    expect(await rowsOf('')).toEqual([]);
  });

  it('fails on a quote left open at the end', async () => {
    await expect(rowsOf('"a,b\n')).rejects.toThrow('inside a quoted field');
  });
});

describe('csvRecords', () => {
  it('keys each row by the header, dropping a byte order mark', async () => {
    expect(
      await Array.fromAsync(
        csvRecords(chunksOf('﻿"fdc_id","description"\n"1","Milk"\n"2"\n')),
      ),
    ).toEqual([
      { fdc_id: '1', description: 'Milk' },
      { fdc_id: '2', description: '' },
    ]);
  });
});
