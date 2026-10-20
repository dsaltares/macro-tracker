import { type Kysely, type Selectable, sql } from 'kysely';
import type { Database, FoodImportsTable } from './schema.ts';

export type FoodImport = Selectable<FoodImportsTable>;

export type FoodImportCounts = Pick<
  FoodImport,
  'inserted' | 'updated' | 'archived'
>;

export type FoodImportStart =
  | { started: true; run: FoodImport }
  | { started: false; running: FoodImport };

export const interrupted = 'interrupted';

const sourceSeparator = ',';

export const runningFoodImport = (db: Kysely<Database>) =>
  db
    .selectFrom('food_imports')
    .selectAll()
    .where('status', '=', 'running')
    .executeTakeFirst();

export const recentFoodImportLimit = 20;

export const recentFoodImports = (
  db: Kysely<Database>,
  limit: number = recentFoodImportLimit,
) =>
  db
    .selectFrom('food_imports')
    .selectAll()
    .orderBy('started_at', 'desc')
    .limit(limit)
    .execute();

const listing = (source: string) =>
  `%${sourceSeparator}${source}${sourceSeparator}%`;

export const lastSucceededFoodImportQuery = (
  db: Kysely<Database>,
  source: string,
) =>
  db
    .selectFrom('food_imports')
    .selectAll()
    .where('status', '=', 'succeeded')
    .where(
      sql<boolean>`${sourceSeparator} || ${sql.ref('sources')} || ${sourceSeparator} like ${listing(source)}`,
    )
    .orderBy('started_at', 'desc')
    .limit(1);

export const lastSucceededFoodImport = (db: Kysely<Database>, source: string) =>
  lastSucceededFoodImportQuery(db, source).executeTakeFirst();

export type NewFoodImport = {
  id: string;
  sources: readonly string[];
  startedAt: string;
};

export const startFoodImport = (
  db: Kysely<Database>,
  { id, sources, startedAt }: NewFoodImport,
): Promise<FoodImportStart> =>
  db.transaction().execute(async (trx) => {
    const running = await runningFoodImport(trx);
    if (running) {
      return { started: false, running };
    }
    const run = await trx
      .insertInto('food_imports')
      .values({
        id,
        sources: sources.join(sourceSeparator),
        status: 'running',
        started_at: startedAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { started: true, run };
  });

export const recordFoodImportProgress = async (
  db: Kysely<Database>,
  id: string,
  counts: FoodImportCounts,
) => {
  await db
    .updateTable('food_imports')
    .set(counts)
    .where('id', '=', id)
    .where('status', '=', 'running')
    .execute();
};

export type FoodImportOutcome =
  | { status: 'succeeded' }
  | { status: 'failed'; error: string };

export const finishFoodImport = (
  db: Kysely<Database>,
  id: string,
  counts: FoodImportCounts,
  outcome: FoodImportOutcome,
  now: () => string,
) =>
  db
    .updateTable('food_imports')
    .set({
      ...counts,
      status: outcome.status,
      error: outcome.status === 'failed' ? outcome.error : null,
      finished_at: now(),
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

export const failInterruptedFoodImports = async (
  db: Kysely<Database>,
  now: () => string,
) => {
  const failed = await db
    .updateTable('food_imports')
    .set({ status: 'failed', error: interrupted, finished_at: now() })
    .where('status', '=', 'running')
    .returning('id')
    .execute();
  return failed.map(({ id }) => id);
};
