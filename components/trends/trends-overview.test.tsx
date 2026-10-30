import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadFailed,
  TrendsOverview,
} from '@/components/trends/trends-overview';
import { logMeasurement } from '@/lib/db/body-measurements';
import { insertDiaryEntry } from '@/lib/db/diary';
import { addDays, formatDay, localDateOf } from '@/lib/domain/dates';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { routes } from '@/lib/routes';
import { serveApi } from '@/test/api';
import { seedManualGoal } from '@/test/diary';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const today = localDateOf(new Date());

const seeding = (id: string) => ({
  nextId: () => id,
  now: () => '2026-10-20T08:00:00.000Z',
});

const logDay = (date: string, nutrients: NutrientVector) =>
  insertDiaryEntry(
    api.database(),
    'user-1',
    {
      kind: 'quick',
      date,
      meal: 'lunch',
      time: null,
      label: 'Lunch',
      nutrients,
    },
    seeding(`entry-${date}`),
  );

const logWeight = (date: string, value: number) =>
  logMeasurement(
    api.database(),
    'user-1',
    { date, metric: 'weight_kg', value },
    seeding(`weight-${date}`),
  );

const seedTwoDays = async () => {
  await seedManualGoal(api.database(), { energy_kcal: 2000 });
  await logDay(today, {
    energy_kcal: 2000,
    protein: 150,
    carbohydrate: 200,
    fat: 70,
  });
  await logDay(addDays(today, -1), {
    energy_kcal: 2400,
    protein: 100,
    carbohydrate: 300,
    fat: 90,
  });
};

const render = () => renderUi(<TrendsOverview />, { wrap: api.wrap });

const section = (name: string) => screen.getByRole('region', { name });

const findSection = (name: string) => screen.findByRole('region', { name });

const shown = (term: string) =>
  within(section('Summary'))
    .getAllByRole('term')
    .find((candidate) => candidate.textContent === term)?.nextElementSibling
    ?.textContent;

const figureIn = (name: string) => within(section(name)).queryByRole('figure');

describe('TrendsOverview', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('sums up the last 30 days until another range is chosen', async () => {
    await seedTwoDays();
    render();

    expect(await screen.findByText('2 of 30 days logged')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(shown('Average energy')).toBe('2,200 kcal');
    expect(shown('Average protein')).toBe('125 g');
    expect(shown('Average carbohydrate')).toBe('250 g');
    expect(shown('Average fat')).toBe('80 g');
    expect(shown('Adherence')).toBe('50%');
    expect(
      within(section('Summary')).getByRole('link', { name: 'Nutrient report' }),
    ).toHaveAttribute('href', routes.nutrientReport);
  });

  it('summarises the energy and macro charts for screen readers', async () => {
    await seedTwoDays();
    render();

    expect(
      await screen.findByRole('figure', {
        name:
          `From ${formatDay(addDays(today, -29))} to ${formatDay(today)}: ` +
          '2 of 30 days logged, averaging 2,200 kcal a day against a goal of 2,000 kcal. ' +
          'The 7-day average ends at 2,200 kcal.',
      }),
    ).toBeInTheDocument();
    expect(figureIn('Macros')).toHaveAccessibleName(
      'On an average logged day: protein 125 g, carbohydrate 250 g, fat 80 g.',
    );
  });

  it('reads the range chosen', async () => {
    await seedTwoDays();
    await logDay(addDays(today, -10), { energy_kcal: 1000 });
    const { user } = render();

    expect(await screen.findByText('3 of 30 days logged')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByText('2 of 7 days logged')).toBeInTheDocument();
    expect(figureIn('Energy')).toHaveAccessibleName(
      new RegExp(`^From ${formatDay(addDays(today, -6))} to `),
    );

    await user.click(screen.getByRole('button', { name: '90 days' }));
    expect(await screen.findByText('3 of 90 days logged')).toBeInTheDocument();
    expect(shown('Average energy')).toBe('1,800 kcal');
  });

  it('leaves out the charts of a range with nothing logged', async () => {
    render();

    expect(
      await screen.findByText('Nothing logged in the last 30 days.'),
    ).toBeInTheDocument();
    expect(shown('Average energy')).toBe('–');
    expect(shown('Adherence')).toBe('–');
    expect(screen.queryByRole('region', { name: 'Energy' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Macros' })).toBeNull();
  });

  it('has no adherence without a kcal goal', async () => {
    await logDay(today, { energy_kcal: 2000 });
    render();

    expect(await screen.findByText('1 of 30 days logged')).toBeInTheDocument();
    expect(shown('Adherence')).toBe('–');
    expect(figureIn('Energy')).toHaveAccessibleName(
      /averaging 2,000 kcal a day\. The 7-day average/,
    );
  });

  it('shows the weight trend and its weekly rate over the range', async () => {
    await logWeight(addDays(today, -7), 80);
    await logWeight(today, 78);
    const { user } = render();

    expect(
      await within(await findSection('Weight')).findByRole('figure', {
        name:
          `From ${formatDay(addDays(today, -7))} to ${formatDay(today)}: ` +
          '2 weights between 78 kg and 80 kg; the trend went from 80 kg to 79 kg.',
      }),
    ).toBeInTheDocument();
    expect(shown('Weekly weight rate')).toBe('-1 kg a week');
    expect(
      within(section('Weight')).getByRole('link', { name: 'Weight log' }),
    ).toHaveAttribute('href', routes.body);

    await user.click(screen.getByRole('button', { name: '7 days' }));
    expect(
      await within(section('Weight')).findByRole('figure', {
        name: /^From .* 1 weight between 78 kg and 78 kg/,
      }),
    ).toBeInTheDocument();
    expect(shown('Weekly weight rate')).toBe('–');
  });

  it('says when the range has no weights', async () => {
    await logWeight(addDays(today, -40), 80);
    render();

    expect(
      await within(await findSection('Weight')).findByText(
        'No weights in the last 30 days.',
      ),
    ).toBeInTheDocument();
    expect(figureIn('Weight')).toBeNull();
  });

  it('says when the trends could not be loaded', async () => {
    api.fails('trends.range');
    render();

    expect(await screen.findByText(loadFailed)).toBeInTheDocument();
  });

  it.each(['light', 'dark'])(
    'summarises every chart in the %s theme',
    async (theme) => {
      localStorage.setItem('theme', theme);
      await seedTwoDays();
      await logWeight(today, 78);
      render();

      expect(await screen.findAllByRole('figure')).toHaveLength(3);
      expect(document.documentElement).toHaveClass(theme);
      expect(
        screen.getAllByRole('figure').map((figure) => figure.textContent),
      ).toEqual([
        expect.stringMatching(/^From .* averaging 2,200 kcal a day/),
        expect.stringMatching(/^On an average logged day/),
        expect.stringMatching(/^From .* 1 weight between 78 kg and 78 kg/),
      ]);
    },
  );
});
