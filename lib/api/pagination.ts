import { z } from 'zod';

const cursorPattern = /^offset:(\d+)$/;

export const cursorOf = (offset: number) =>
  Buffer.from(`offset:${offset}`).toString('base64url');

const offsetOf = (cursor: string) => {
  const match = cursorPattern.exec(Buffer.from(cursor, 'base64url').toString());
  const offset = Number(match?.[1]);
  return match && Number.isSafeInteger(offset) ? offset : null;
};

export const cursorSchema = z
  .string()
  .optional()
  .transform((cursor, context) => {
    if (cursor === undefined) {
      return 0;
    }
    const offset = offsetOf(cursor);
    if (offset === null) {
      context.addIssue({
        code: 'custom',
        message: 'Not a cursor this API returned',
      });
      return z.NEVER;
    }
    return offset;
  });

export type Page<Item> = { items: Item[]; nextCursor: string | null };

export const pageOf = <Item>(
  items: Item[],
  nextOffset: number | null,
): Page<Item> => ({
  items,
  nextCursor: nextOffset === null ? null : cursorOf(nextOffset),
});
