import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { futureDate } from '@/components/body/weight-form';
import {
  loadFailed,
  removeFailed,
  WeightLog,
} from '@/components/body/weight-log';
import { listMeasurements, logMeasurement } from '@/lib/db/body-measurements';
import { addDays, formatDay, localDateOf } from '@/lib/domain/dates';
import { serveApi } from '@/test/api';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const today = localDateOf(new Date());

const logWeight = (userId: string, date: string, value: number) =>
  logMeasurement(
    api.database(),
    userId,
    { date, metric: 'weight_kg', value },
    {
      now: () => '2026-10-20T08:00:00.000Z',
      nextId: () => `${userId}-${date}`,
    },
  );

const addUser = (id: string) =>
  api
    .database()
    .insertInto('users')
    .values({ id, name: id, email: `${id}@example.test` })
    .execute();

const savedWeights = async () =>
  (
    await listMeasurements(api.database(), 'user-1', { metric: 'weight_kg' })
  ).map(({ date, value }) => [date, value]);

const render = () => renderUi(<WeightLog />, { wrap: api.wrap });

const weightLog = () =>
  within(screen.getByRole('region', { name: 'Weight log' }));

const shownRows = () =>
  weightLog()
    .getAllByRole('listitem')
    .map((row) => row.textContent);

const enter = async (
  user: ReturnType<typeof render>['user'],
  { day, weight }: { day?: string; weight: string },
) => {
  if (day !== undefined) {
    await user.clear(screen.getByLabelText('Day'));
    await user.type(screen.getByLabelText('Day'), day);
  }
  await user.type(screen.getByLabelText('Weight (kg)'), weight);
  await user.click(screen.getByRole('button', { name: 'Log weight' }));
};

describe('WeightLog', () => {
  it('says when nothing is logged yet', async () => {
    render();

    expect(
      await screen.findByText('No weights logged yet.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Day')).toHaveValue(today);
  });

  it("lists the caller's weights, newest first", async () => {
    await logWeight('user-1', '2026-10-18', 73);
    await logWeight('user-1', '2026-10-20', 72.4);
    await logWeight('user-1', '2026-10-19', 72.8);
    await addUser('user-2');
    await logWeight('user-2', '2026-10-19', 90);
    render();

    await screen.findByText('Tue, 20 Oct 2026');
    expect(shownRows()).toEqual([
      'Tue, 20 Oct 202672.4 kgRemove the weight of Tue, 20 Oct 2026',
      'Mon, 19 Oct 202672.8 kgRemove the weight of Mon, 19 Oct 2026',
      'Sun, 18 Oct 202673 kgRemove the weight of Sun, 18 Oct 2026',
    ]);
  });

  it('logs a weight for an earlier day and lists it', async () => {
    const { user } = render();
    const yesterday = addDays(today, -1);

    await screen.findByText('No weights logged yet.');
    await enter(user, { day: yesterday, weight: '72.8' });

    expect(await weightLog().findByText('72.8 kg')).toBeInTheDocument();
    expect(screen.getByText(formatDay(yesterday))).toBeInTheDocument();
    expect(await savedWeights()).toEqual([[yesterday, 72.8]]);
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue(null);
  });

  it('replaces the weight of a day already logged', async () => {
    await logWeight('user-1', today, 72.4);
    const { user } = render();

    await weightLog().findByText('72.4 kg');
    await enter(user, { weight: '71.9' });

    expect(await weightLog().findByText('71.9 kg')).toBeInTheDocument();
    expect(weightLog().queryByText('72.4 kg')).not.toBeInTheDocument();
    expect(await savedWeights()).toEqual([[today, 71.9]]);
  });

  it('refuses a day that has not come yet', async () => {
    const { user } = render();

    await screen.findByText('No weights logged yet.');
    await enter(user, { day: addDays(today, 1), weight: '72' });

    expect(await screen.findByText(futureDate)).toBeInTheDocument();
    expect(await savedWeights()).toEqual([]);
  });

  it('removes a weight', async () => {
    await logWeight('user-1', '2026-10-19', 72.8);
    await logWeight('user-1', '2026-10-20', 72.4);
    const { user } = render();

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove the weight of Tue, 20 Oct 2026',
      }),
    );

    await expect.poll(savedWeights).toEqual([['2026-10-19', 72.8]]);
    await expect.poll(() => screen.queryByText('Tue, 20 Oct 2026')).toBeNull();
    expect(weightLog().getByText('72.8 kg')).toBeInTheDocument();
  });

  it('says so when a weight cannot be removed, and keeps it', async () => {
    await logWeight('user-1', '2026-10-20', 72.4);
    const { user } = render();
    api.fails('body.remove');

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove the weight of Tue, 20 Oct 2026',
      }),
    );

    expect(await screen.findByText(removeFailed)).toBeInTheDocument();
    expect(weightLog().getByText('72.4 kg')).toBeInTheDocument();
  });

  it('says so when the weights cannot be loaded', async () => {
    api.fails('body.list');
    render();

    expect(await screen.findByText(loadFailed)).toBeInTheDocument();
  });
});
