import { siteName } from '../../brand.ts';
import type { HistoryImportSummary } from '../../domain/imports/history-import.ts';
import { type ActionEmailCopy, actionEmail } from './action-email.tsx';

const footer = `You get this email because you started an import in ${siteName}. Your API key was used for that import alone and never stored.`;

const number = new Intl.NumberFormat('en-GB');

const plural = (count: number, one: string, many = `${one}s`) =>
  `${number.format(count)} ${count === 1 ? one : many}`;

export const importSucceededCopy = (
  summary: HistoryImportSummary,
): ActionEmailCopy => ({
  subject: 'Your import finished',
  preview: `${plural(summary.days, 'day')} and ${plural(summary.weights, 'weight')} imported.`,
  heading: 'Your import finished',
  body: `${plural(summary.entries, 'entry', 'entries')} over ${plural(summary.days, 'day')} and ${plural(summary.weights, 'weight')} are in your diary${summary.skippedDays > 0 ? `, skipping ${plural(summary.skippedDays, 'day')} you had already logged` : ''}.${summary.failedMeals > 0 ? ` ${plural(summary.failedMeals, 'meal')} could not be imported; the import page lists them.` : ''}`,
  button: 'See what was imported',
  footer,
});

export const importFailedCopy = (error: string): ActionEmailCopy => ({
  subject: 'Your import stopped',
  preview: error,
  heading: 'Your import stopped',
  body: `${error} What it imported before stopping stays in your diary.`,
  button: 'Go to import',
  footer,
});

export const historyImportEmail = ({
  to,
  url,
  outcome,
}: {
  to: string;
  url: string;
  outcome:
    | { status: 'succeeded'; summary: HistoryImportSummary }
    | { status: 'failed'; error: string };
}) =>
  actionEmail({
    to,
    url,
    copy:
      outcome.status === 'succeeded'
        ? importSucceededCopy(outcome.summary)
        : importFailedCopy(outcome.error),
  });
