import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { ImportSettings } from '@/components/settings/import-settings';
import type { HistoryImportSummary } from '@/lib/domain/imports/history-import';
import { loginRefused } from '@/lib/imports/cronometer/client';
import { serveApi } from '@/test/api';
import {
  cronometerEmail,
  cronometerPassword,
  fakeCronometer,
} from '@/test/cronometer';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const render = () => renderUi(<ImportSettings />, { wrap: api.wrap });

const cronometer = () =>
  http.post('https://mobile.cronometer.com/api/v2/*', ({ request }) =>
    fakeCronometer().answer(request),
  );

const summary: HistoryImportSummary = {
  days: 59,
  skippedDays: 2,
  entries: 1175,
  quickEntries: 26,
  skippedEntries: 0,
  failedMeals: 0,
  weights: 42,
  skippedWeights: 0,
  sourceKcal: 130224,
  importedKcal: 130442,
  foods: [
    {
      sourceId: '1',
      name: 'Cheese, cheddar',
      kind: 'source id',
      matchedTo: 'Cheese, cheddar',
    },
    {
      sourceId: '2',
      name: 'Scrambled eggs+whites',
      kind: 'new',
      matchedTo: null,
    },
  ],
};

const storeImport = (
  values: Partial<{
    status: 'running' | 'succeeded' | 'failed';
    phase: 'reading' | 'matching' | 'logging' | 'weights';
    done: number;
    total: number;
    summary: string | null;
    error: string | null;
    finished_at: string | null;
  }>,
) =>
  api
    .database()
    .insertInto('history_imports')
    .values({
      id: 'run-1',
      user_id: 'user-1',
      source: 'cronometer',
      status: 'succeeded',
      phase: 'weights',
      started_at: '2026-10-21T09:00:00.000Z',
      ...values,
    })
    .execute();

const importButton = () => screen.getByRole('button', { name: 'Import' });

const signInToCronometer = async (
  user: ReturnType<typeof render>['user'],
  password: string,
) => {
  await user.type(screen.getByLabelText('Cronometer email'), cronometerEmail);
  await user.type(screen.getByLabelText('Cronometer password'), password);
  await user.click(importButton());
};

describe('ImportSettings', () => {
  it('asks for the email and password before importing', async () => {
    const { user } = render();

    await user.click(importButton());

    expect(
      await screen.findByText('Enter your Cronometer email'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enter your Cronometer password'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Import from' }),
    ).toHaveDisplayValue('Cronometer');
  });

  it('starts an import and follows it until it is done', async () => {
    api.use(cronometer());
    const { user } = render();

    await signInToCronometer(user, cronometerPassword);

    const latest = await screen.findByRole(
      'region',
      { name: 'Last import' },
      { timeout: 3000 },
    );
    expect(within(latest).getByText('Days imported')).toBeInTheDocument();
    expect(screen.getByLabelText('Cronometer password')).toHaveValue('');
  });

  it('says when Cronometer refuses the password', async () => {
    api.use(cronometer());
    const { user } = render();

    await signInToCronometer(user, 'wrong');

    expect(await screen.findByText(loginRefused)).toBeInTheDocument();
  });

  it('shows a running import and holds the button', async () => {
    await storeImport({
      status: 'running',
      phase: 'logging',
      done: 3,
      total: 10,
    });
    render();

    const progress = await screen.findByRole('progressbar', {
      name: 'Logging your diary',
    });
    expect(progress).toHaveAttribute('aria-valuenow', '3');
    expect(progress).toHaveAttribute('aria-valuemax', '10');
    expect(
      screen.getByText('Logging your diary · 3 of 10'),
    ).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
  });

  it('sums up the last import and what each food became', async () => {
    await storeImport({
      summary: JSON.stringify(summary),
      finished_at: '2026-10-21T09:30:00.000Z',
    });
    const { user } = render();

    const latest = await screen.findByRole('region', { name: 'Last import' });
    expect(within(latest).getByText('1,175')).toBeInTheDocument();
    expect(within(latest).getByText('130,224 kcal')).toBeInTheDocument();
    expect(within(latest).getByText('130,442 kcal')).toBeInTheDocument();
    await user.click(within(latest).getByText('What each of 2 foods became'));
    expect(
      within(latest).getByText('The same food: Cheese, cheddar'),
    ).toBeInTheDocument();
    expect(within(latest).getByText('New food of yours')).toBeInTheDocument();
    expect(importButton()).toBeEnabled();
  });

  it('shows why the last import stopped', async () => {
    await storeImport({ status: 'failed', error: 'Cronometer is down.' });
    render();

    expect(await screen.findByText('Cronometer is down.')).toBeInTheDocument();
  });
});
