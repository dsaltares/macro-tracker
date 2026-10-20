import { screen, within } from '@testing-library/react';
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { describe, expect, it } from 'vitest';
import {
  loadFailed,
  NutrientPanel,
} from '@/components/nutrients/nutrient-panel';
import { noData } from '@/components/nutrients/nutrient-rows';
import { insertDiaryEntry } from '@/lib/db/diary';
import { serveApi } from '@/test/api';
import { seedDiaryDay, seedManualGoal } from '@/test/diary';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const day = '2026-10-19';

const render = (search = `?date=${day}`) => {
  const urlUpdates: UrlUpdateEvent[] = [];
  return {
    urlUpdates,
    ...renderUi(<NutrientPanel />, {
      wrap: (children) =>
        api.wrap(
          <NuqsTestingAdapter
            searchParams={search}
            hasMemory
            onUrlUpdate={(update) => urlUpdates.push(update)}
          >
            {children}
          </NuqsTestingAdapter>,
        ),
    }),
  };
};

const seedSparklingWater = () =>
  insertDiaryEntry(
    api.database(),
    'user-1',
    {
      kind: 'quick',
      date: day,
      meal: 'snack',
      time: null,
      label: 'Sparkling water',
      nutrients: { energy_kcal: 0, vitamin_c: 0 },
    },
    { nextId: () => 'water-1', now: () => '2026-10-19T16:00:00.000Z' },
  );

const group = (name: string) => screen.getByRole('region', { name });

const shown = (groupName: string, label: string) => {
  const region = group(groupName);
  const terms = within(region).getAllByRole('term');
  const index = terms.findIndex((term) => term.textContent === label);
  return within(region).getAllByRole('definition')[index];
};

const meter = (name: string) => screen.queryByRole('meter', { name });

describe('NutrientPanel', () => {
  it('lists every nutrient of the day by group, in display order', async () => {
    await seedDiaryDay(api.database(), day);
    render();

    expect(await screen.findByRole('region', { name: 'Energy' })).toBeVisible();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Energy',
      'Macros',
      'Fat detail',
      'Carbohydrate detail',
      'Minerals',
      'Vitamins',
      'Other',
    ]);
    expect(
      within(group('Macros'))
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Protein', 'Carbohydrate', 'Fat', 'Fibre', 'Alcohol', 'Water']);
    expect(shown('Energy', 'Energy')).toHaveTextContent('1,365 kcal');
  });

  it('shows a nutrient no logged food declares as no data, apart from a zero', async () => {
    await seedDiaryDay(api.database(), day);
    await seedSparklingWater();
    await seedManualGoal(api.database(), { energy_kcal: 2000 });
    render();

    await screen.findByRole('region', { name: 'Vitamins' });

    expect(shown('Vitamins', 'Vitamin C')).toHaveTextContent('0 mg of 95 mg');
    expect(meter('Vitamin C')).toHaveAttribute(
      'aria-valuetext',
      '0%, under target',
    );
    expect(shown('Minerals', 'Iron')).toHaveTextContent(noData);
    expect(shown('Minerals', 'Iron')).toHaveTextContent('of 16 mg');
    expect(meter('Iron')).not.toBeInTheDocument();
    expect(shown('Other', 'Caffeine')).toHaveTextContent(noData);
  });

  it('colours a limit by how close the day is to it, and a target by whether it is reached', async () => {
    await seedDiaryDay(api.database(), day);
    await seedManualGoal(api.database(), {
      energy_kcal: 1300,
      fibre: 30,
      saturated_fat: 4,
      sodium: 18,
    });
    render();

    await screen.findByRole('region', { name: 'Minerals' });

    expect(shown('Fat detail', 'Saturated fat')).toHaveTextContent(
      '4.1 g max 4 g',
    );
    expect(meter('Saturated fat')).toHaveAttribute(
      'aria-valuetext',
      '102%, over limit',
    );
    expect(meter('Sodium')).toHaveAttribute(
      'aria-valuetext',
      '97%, near limit',
    );
    expect(meter('Sugars')).toHaveAttribute(
      'aria-valuetext',
      '20%, under limit',
    );
    expect(meter('Energy')).toHaveAttribute(
      'aria-valuetext',
      '105%, on target',
    );
    expect(meter('Fibre')).toHaveAttribute(
      'aria-valuetext',
      '27%, under target',
    );
  });

  it('narrows to one meal, against the day’s goals', async () => {
    await seedDiaryDay(api.database(), day);
    await seedManualGoal(api.database(), { energy_kcal: 1800 });
    const { user, urlUpdates } = render();

    await screen.findByRole('region', { name: 'Energy' });
    expect(shown('Macros', 'Fibre')).toHaveTextContent('8.1 g');

    await user.click(screen.getByRole('tab', { name: 'Dinner' }));

    expect(await screen.findByText(/of the day’s goals/)).toBeInTheDocument();
    expect(shown('Energy', 'Energy')).toHaveTextContent(
      '900 kcal of 1,800 kcal',
    );
    expect(meter('Energy')).toHaveAttribute(
      'aria-valuetext',
      '50%, under target',
    );
    expect(shown('Macros', 'Fibre')).toHaveTextContent(noData);
    expect(urlUpdates.at(-1)?.queryString).toBe(`?date=${day}&meal=dinner`);

    await user.click(screen.getByRole('tab', { name: 'Lunch' }));

    expect(
      await screen.findByText('Nothing logged for lunch yet.'),
    ).toBeInTheDocument();
  });

  it('opens on the meal in the address', async () => {
    await seedDiaryDay(api.database(), day);
    render(`?date=${day}&meal=breakfast`);

    expect(
      await screen.findByRole('tab', { name: 'Breakfast', selected: true }),
    ).toBeInTheDocument();
    expect(
      await within(
        await screen.findByRole('region', { name: 'Energy' }),
      ).findAllByRole('definition'),
    ).toHaveLength(1);
    expect(shown('Energy', 'Energy')).toHaveTextContent('465 kcal');
  });

  it('says so when nothing is logged on the day', async () => {
    render();

    expect(
      await screen.findByText('Nothing logged on this day yet.'),
    ).toBeInTheDocument();
  });

  it('links back to the diary on the same day', async () => {
    render();

    expect(
      await screen.findByRole('link', { name: 'Back to diary' }),
    ).toHaveAttribute('href', `/diary?date=${day}`);
  });

  it('says so when the nutrients cannot be loaded', async () => {
    api.fails('goals.forDate');
    render();

    expect(await screen.findByText(loadFailed)).toBeInTheDocument();
  });
});
