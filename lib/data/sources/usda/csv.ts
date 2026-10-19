const quote = '"';
const separator = ',';
const newline = '\n';
const carriageReturn = '\r';
const byteOrderMark = '﻿';

export async function* csvRows(
  chunks: AsyncIterable<string>,
): AsyncGenerator<string[]> {
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  let started = false;
  for await (const chunk of chunks) {
    for (const character of chunk) {
      if (quoted) {
        if (character === quote) {
          quoted = false;
          closedQuote = true;
        } else {
          field += character;
        }
        continue;
      }
      if (character === quote) {
        if (closedQuote) {
          field += quote;
        }
        quoted = true;
        closedQuote = false;
        started = true;
      } else if (character === separator) {
        row.push(field);
        field = '';
        closedQuote = false;
        started = true;
      } else if (character === newline) {
        row.push(field);
        yield row;
        row = [];
        field = '';
        closedQuote = false;
        started = false;
      } else if (character !== carriageReturn) {
        field += character;
        closedQuote = false;
        started = true;
      }
    }
  }
  if (quoted) {
    throw new Error('The CSV ends inside a quoted field');
  }
  if (started) {
    row.push(field);
    yield row;
  }
}

export type CsvRecord = Record<string, string>;

export async function* csvRecords(
  chunks: AsyncIterable<string>,
): AsyncGenerator<CsvRecord> {
  let header: string[] | undefined;
  for await (const row of csvRows(chunks)) {
    if (header === undefined) {
      header = row.map((column, at) =>
        at === 0 ? column.replace(byteOrderMark, '') : column,
      );
      continue;
    }
    yield Object.fromEntries(
      header.map((column, at) => [column, row[at] ?? '']),
    );
  }
}
