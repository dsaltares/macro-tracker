import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogWeightCard } from '@/components/body/log-weight-card';
import { saveFailed } from '@/components/body/weight-form';
import { WeightLog } from '@/components/body/weight-log';
import { listMeasurements, logMeasurement } from '@/lib/db/body-measurements';
import { addDays, localDateOf } from '@/lib/domain/dates';
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

const render = () => renderUi(<LogWeightCard />, { wrap: api.wrap });

const card = () => screen.findByRole('region', { name: 'Log weight' });

describe('LogWeightCard', () => {
  it('asks for a weight when none has been logged yet', async () => {
    render();

    expect(await card()).toBeInTheDocument();
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue(null);
    expect(screen.queryByText(/^Last:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument();
  });

  it('shows the last weight logged before today', async () => {
    await logWeight('user-1', '2026-10-18', 72.4);
    render();

    await card();
    expect(
      screen.getByText('Last: 72.4 kg on Sun, 18 Oct 2026'),
    ).toBeInTheDocument();
  });

  it("logs today's weight, then goes away", async () => {
    const { user } = render();

    await user.type(await screen.findByLabelText('Weight (kg)'), '71.9');
    await user.click(screen.getByRole('button', { name: 'Log weight' }));

    await expect.poll(savedWeights).toEqual([[today, 71.9]]);
    await expect
      .poll(() => screen.queryByRole('region', { name: 'Log weight' }))
      .toBeNull();
  });

  it('is not there when today already has a weight', async () => {
    await logWeight('user-1', today, 72.4);
    await logWeight('user-1', addDays(today, -1), 72.8);
    renderUi(
      <>
        <LogWeightCard />
        <WeightLog />
      </>,
      { wrap: api.wrap },
    );

    expect(await screen.findByText('72.8 kg')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Log weight' }),
    ).not.toBeInTheDocument();
  });

  it("ignores another user's weight for today", async () => {
    await addUser('user-2');
    await logWeight('user-2', today, 90);
    render();

    expect(await card()).toBeInTheDocument();
  });

  it('refuses a weight out of range, and saves nothing', async () => {
    const { user } = render();

    await user.type(await screen.findByLabelText('Weight (kg)'), '12');
    await user.click(screen.getByRole('button', { name: 'Log weight' }));

    expect(
      await screen.findByText('Enter a weight of at least 20 kg.'),
    ).toBeInTheDocument();
    expect(await savedWeights()).toEqual([]);
  });

  it('says so when the weight cannot be saved', async () => {
    const { user } = render();
    api.fails('body.log');

    await user.type(await screen.findByLabelText('Weight (kg)'), '71.9');
    await user.click(screen.getByRole('button', { name: 'Log weight' }));

    expect(await screen.findByText(saveFailed)).toBeInTheDocument();
  });
});
