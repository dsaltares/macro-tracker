import type { Logger } from 'pino';
import { authBaseUrl } from '../auth/base-url.ts';
import {
  finishHistoryImport,
  type HistoryImport,
  type HistoryImportOutcome,
  recordHistoryImportProgress,
  startHistoryImport,
} from '../db/history-imports.ts';
import { accountQuery } from '../db/users.ts';
import { today } from '../domain/dates.ts';
import type { StartHistoryImport } from '../domain/imports/history-import.ts';
import { sendEmail as sendEmailThroughTransport } from '../email/send.ts';
import { historyImportEmail } from '../email/templates/history-import.tsx';
import type { SendEmail } from '../email/transport.ts';
import { getLogger } from '../logger.ts';
import { routes } from '../routes.ts';
import type { ServiceContext } from '../services/context.ts';
import { accountOf } from './cronometer/account.ts';
import {
  type Cronometer,
  cronometerClient,
  isCronometerFailure,
} from './cronometer/client.ts';
import { applyImport, planImport, summaryOf } from './cronometer/import.ts';

export type HistoryImportDependencies = {
  fetch?: typeof fetch;
  sendEmail?: SendEmail;
  baseUrl?: () => string;
  logger?: Logger;
};

export type LaunchedHistoryImport =
  | { started: true; run: HistoryImport; finished: Promise<HistoryImport> }
  | { started: false; running: HistoryImport };

export const unexpectedFailure =
  'The import stopped on an unexpected error. Try again: it skips the days it already imported.';

const failureMessage = (error: unknown) =>
  isCronometerFailure(error) ? error.message : unexpectedFailure;

const runHistoryImport = async ({
  context,
  run,
  cronometer,
  timeZone,
  sendEmail,
  baseUrl,
  logger,
}: {
  context: ServiceContext;
  run: HistoryImport;
  cronometer: Cronometer;
  timeZone: string;
  sendEmail: SendEmail;
  baseUrl: () => string;
  logger: Logger;
}) => {
  const account = accountOf(context);
  const onProgress = (
    progress: Parameters<typeof recordHistoryImportProgress>[2],
  ) => recordHistoryImportProgress(context.db, run.id, progress);
  let outcome: HistoryImportOutcome;
  try {
    const plan = await planImport({
      cronometer,
      account,
      to: today(context, timeZone),
      onProgress,
    });
    const report = await applyImport(account, plan, onProgress);
    outcome = { status: 'succeeded', summary: summaryOf(plan, report) };
    logger.info(
      { importId: run.id, failedMeals: report.failedMeals },
      'History import finished',
    );
  } catch (error) {
    logger.error({ importId: run.id, err: error }, 'History import failed');
    outcome = { status: 'failed', error: failureMessage(error) };
  }
  const finished = await finishHistoryImport(
    context.db,
    run.id,
    outcome,
    context.now,
  );
  const user = await accountQuery(
    context.db,
    context.caller.userId,
  ).executeTakeFirst();
  if (user) {
    await sendEmail(
      await historyImportEmail({
        to: user.email,
        url: new URL(routes.import, baseUrl()).toString(),
        outcome,
      }),
    );
  }
  return finished;
};

export const launchHistoryImport = async (
  context: ServiceContext,
  { source, email, password, timeZone }: StartHistoryImport,
  {
    fetch: send = fetch,
    sendEmail = sendEmailThroughTransport,
    baseUrl = () => authBaseUrl(),
    logger = getLogger('history-import'),
  }: HistoryImportDependencies = {},
): Promise<LaunchedHistoryImport> => {
  const cronometer = cronometerClient({ email, password, fetch: send });
  await cronometer.login();
  const start = await startHistoryImport(context.db, context.caller.userId, {
    id: context.nextId(),
    source,
    startedAt: context.now(),
  });
  if (!start.started) {
    return start;
  }
  const finished = runHistoryImport({
    context,
    run: start.run,
    cronometer,
    timeZone,
    sendEmail,
    baseUrl,
    logger,
  });
  return { started: true, run: start.run, finished };
};
