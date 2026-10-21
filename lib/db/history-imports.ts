import type { Kysely, Selectable } from 'kysely';
import {
  type HistoryImportProgress,
  type HistoryImportSummary,
  type HistorySource,
  historyImportSummarySchema,
  interruptedHistoryImport,
} from '../domain/imports/history-import.ts';
import type { Database, HistoryImportsTable } from './schema.ts';

type HistoryImportRow = Selectable<HistoryImportsTable>;

export type HistoryImport = Omit<HistoryImportRow, 'user_id' | 'summary'> & {
  summary: HistoryImportSummary | null;
};

const historyImportOf = ({
  user_id: _userId,
  summary,
  ...row
}: HistoryImportRow): HistoryImport => ({
  ...row,
  summary:
    summary === null
      ? null
      : historyImportSummarySchema.parse(JSON.parse(summary)),
});

export type HistoryImportStart =
  | { started: true; run: HistoryImport }
  | { started: false; running: HistoryImport };

export const runningHistoryImportQuery = (
  db: Kysely<Database>,
  userId: string,
) =>
  db
    .selectFrom('history_imports')
    .selectAll()
    .where('user_id', '=', userId)
    .where('status', '=', 'running');

export const latestHistoryImportQuery = (
  db: Kysely<Database>,
  userId: string,
) =>
  db
    .selectFrom('history_imports')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('started_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1);

export const latestHistoryImport = async (
  db: Kysely<Database>,
  userId: string,
) => {
  const row = await latestHistoryImportQuery(db, userId).executeTakeFirst();
  return row ? historyImportOf(row) : null;
};

export const startHistoryImport = (
  db: Kysely<Database>,
  userId: string,
  {
    id,
    source,
    startedAt,
  }: { id: string; source: HistorySource; startedAt: string },
): Promise<HistoryImportStart> =>
  db.transaction().execute(async (trx) => {
    const running = await runningHistoryImportQuery(
      trx,
      userId,
    ).executeTakeFirst();
    if (running) {
      return { started: false, running: historyImportOf(running) };
    }
    const run = await trx
      .insertInto('history_imports')
      .values({
        id,
        user_id: userId,
        source,
        status: 'running',
        phase: 'reading',
        started_at: startedAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { started: true, run: historyImportOf(run) };
  });

export const recordHistoryImportProgress = async (
  db: Kysely<Database>,
  id: string,
  progress: HistoryImportProgress,
) => {
  await db
    .updateTable('history_imports')
    .set(progress)
    .where('id', '=', id)
    .where('status', '=', 'running')
    .execute();
};

export type HistoryImportOutcome =
  | { status: 'succeeded'; summary: HistoryImportSummary }
  | { status: 'failed'; error: string };

export const finishHistoryImport = async (
  db: Kysely<Database>,
  id: string,
  outcome: HistoryImportOutcome,
  now: () => string,
) =>
  historyImportOf(
    await db
      .updateTable('history_imports')
      .set({
        status: outcome.status,
        summary:
          outcome.status === 'succeeded'
            ? JSON.stringify(outcome.summary)
            : null,
        error: outcome.status === 'failed' ? outcome.error : null,
        finished_at: now(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow(),
  );

export const failInterruptedHistoryImports = async (
  db: Kysely<Database>,
  now: () => string,
) => {
  const failed = await db
    .updateTable('history_imports')
    .set({
      status: 'failed',
      error: interruptedHistoryImport,
      finished_at: now(),
    })
    .where('status', '=', 'running')
    .returning('id')
    .execute();
  return failed.map(({ id }) => id);
};
