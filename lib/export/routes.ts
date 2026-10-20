import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DiaryRange } from '../db/diary.ts';
import { diaryEntries } from '../db/diary.ts';
import { exportAccount, measurementsOldestFirst } from '../db/export.ts';
import type { Database } from '../db/schema.ts';
import { isDate } from '../domain/dates.ts';
import { diaryCsv, weightsCsv } from '../domain/export/csv.ts';
import type { Caller } from '../trpc/context.ts';

const dateParam = z.string().refine(isDate);

const rangeSchema = z
  .object({ from: dateParam.optional(), to: dateParam.optional() })
  .refine(
    ({ from, to }) => from === undefined || to === undefined || from <= to,
  );

const fileStem = 'macro-tracker';

const unauthorized = () =>
  Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

const invalidRange = () =>
  Response.json({ error: 'INVALID_RANGE' }, { status: 400 });

const byteOrderMark = '﻿';

const attachment = (body: string, contentType: string, fileName: string) =>
  new Response(body, {
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    },
  });

const csvAttachment = (csv: string, fileName: string) =>
  attachment(
    `${byteOrderMark}${csv}`,
    'text/csv; charset=utf-8',
    `${fileName}.csv`,
  );

const rangedName = (name: string, { from, to }: DiaryRange) =>
  [
    `${fileStem}-${name}`,
    from === undefined ? [] : [`from-${from}`],
    to === undefined ? [] : [`to-${to}`],
  ]
    .flat()
    .join('-');

const rangeOf = (request: Request) =>
  rangeSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

export type ResolveCaller = (headers: Headers) => Promise<Caller | null>;

export type ExportRoutesOptions = {
  db: Kysely<Database>;
  now: () => string;
  resolveCaller: ResolveCaller;
};

export const exportRoutes = ({
  db,
  now,
  resolveCaller,
}: ExportRoutesOptions) => {
  const signedIn =
    (handle: (request: Request, caller: Caller) => Promise<Response>) =>
    async (request: Request) => {
      const caller = await resolveCaller(request.headers);
      return caller === null ? unauthorized() : handle(request, caller);
    };

  const ranged = (
    handle: (range: DiaryRange, caller: Caller) => Promise<Response>,
  ) =>
    signedIn(async (request, caller) => {
      const range = rangeOf(request);
      return range.success ? handle(range.data, caller) : invalidRange();
    });

  return {
    diaryCsv: ranged(async (range, { userId }) =>
      csvAttachment(
        diaryCsv(await diaryEntries(db, userId, range)),
        rangedName('diary', range),
      ),
    ),
    weightsCsv: ranged(async (range, { userId }) =>
      csvAttachment(
        weightsCsv(
          await measurementsOldestFirst(db, userId, {
            metric: 'weight_kg',
            ...range,
          }),
        ),
        rangedName('weights', range),
      ),
    ),
    allJson: signedIn(async (_, { userId }) => {
      const exportedAt = now();
      return attachment(
        JSON.stringify(await exportAccount(db, userId, exportedAt), null, 2),
        'application/json; charset=utf-8',
        `${fileStem}-${exportedAt.slice(0, 10)}.json`,
      );
    }),
  };
};
