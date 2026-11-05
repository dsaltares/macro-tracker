import { type Kysely, sql } from 'kysely';
import { getLogger } from '../logger.ts';
import type { Database } from './schema.ts';

// The full-text index's own tables, each with the column holding its rows' contents and as many
// rows as fill about a thousand pages: the term lists, a page or so a row, and each food's token
// counts, which bm25 and the exact-match tier read for every match, a few bytes a row. Its third,
// foods_fts_idx, is a few hundred kilobytes, read in one go.
const indexTables = [
  { table: 'foods_fts_data', column: 'block', rowsPerChunk: 1_000 },
  { table: 'foods_fts_docsize', column: 'sz', rowsPerChunk: 100_000 },
] as const;

const yieldToRequests = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

// Reads the full-text index into the connection's page cache, so the first searches after a start
// or a food import don't each read thousands of pages from disk. A chunk of rows at a time, letting
// requests in between: better-sqlite3 blocks the event loop while it reads. `max` of a column
// reads every value in full, where `length` of a blob would skip its overflow pages.
export const warmFoodSearch = async (db: Kysely<Database>) => {
  await sql`select max(term) from foods_fts_idx`.execute(db);
  for (const { table, column, rowsPerChunk } of indexTables) {
    let after: number | null = Number.MIN_SAFE_INTEGER;
    while (after !== null) {
      await yieldToRequests();
      const { rows } = await sql<{ last: number | null }>`
        select max(id) as last, max(contents) from (
          select id, ${sql.ref(column)} as contents from ${sql.table(table)}
          where id > ${after} order by id limit ${rowsPerChunk}
        )
      `.execute(db);
      after = rows[0]?.last ?? null;
    }
  }
};

// Warms the index in the background, logging how long it took, or why it failed: a cold cache only
// makes searches slower.
export const warmFoodSearchInBackground = (db: Kysely<Database>) => {
  const logger = getLogger('food-search');
  const started = performance.now();
  warmFoodSearch(db).then(
    () =>
      logger.info(
        { ms: Math.round(performance.now() - started) },
        'Food search index read into the cache',
      ),
    (error: unknown) =>
      logger.warn({ err: error }, 'Could not read the food search index'),
  );
};
