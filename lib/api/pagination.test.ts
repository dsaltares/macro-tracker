import { describe, expect, it } from 'vitest';
import {
  cursorOf,
  cursorSchema,
  pageOf,
  pageOfSlice,
  sliceAt,
} from './pagination.ts';

describe('cursorSchema', () => {
  it('reads no cursor as the first page', () => {
    expect(cursorSchema.parse(undefined)).toBe(0);
  });

  it('reads back the offset of a cursor it wrote', () => {
    expect(cursorSchema.parse(cursorOf(30))).toBe(30);
  });

  it.each([
    ['plain text', 'abc'],
    ['a bare offset', '30'],
    ['a negative offset', cursorOf(-1)],
    [
      'an offset past a safe integer',
      Buffer.from('offset:99999999999999999999').toString('base64url'),
    ],
  ])('refuses %s', (_, cursor) => {
    expect(cursorSchema.safeParse(cursor).error?.issues).toEqual([
      expect.objectContaining({ message: 'Not a cursor this API returned' }),
    ]);
  });
});

describe('pageOf', () => {
  it('is the items and the cursor of the next page', () => {
    const page = pageOf(['a', 'b'], 30);

    expect(page.items).toEqual(['a', 'b']);
    expect(cursorSchema.parse(page.nextCursor)).toBe(30);
  });

  it('has no next cursor on the last page', () => {
    expect(pageOf(['a'], null)).toEqual({ items: ['a'], nextCursor: null });
  });
});

describe('pageOfSlice', () => {
  const slice = sliceAt(20, 2);

  it('reads one row past the page to know there is another', () => {
    expect(slice).toEqual({ offset: 20, limit: 3 });
  });

  it('pages the rows of a slice, dropping the row past the page', () => {
    const page = pageOfSlice([1, 2, 3], slice, String);

    expect(page.items).toEqual(['1', '2']);
    expect(cursorSchema.parse(page.nextCursor)).toBe(22);
  });

  it('has no next cursor when the slice ends inside the page', () => {
    expect(pageOfSlice([1, 2], slice, String)).toEqual({
      items: ['1', '2'],
      nextCursor: null,
    });
  });
});
