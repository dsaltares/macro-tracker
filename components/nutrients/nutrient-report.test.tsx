import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  loadFailed,
  NutrientReport,
} from '@/components/nutrients/nutrient-report';
import { noData } from '@/components/nutrients/nutrient-rows';
import { insertDiaryEntry } from '@/lib/db/diary';
import { addDays, localDateOf } from '@/lib/domain/dates';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { serveApi } from '@/test/api';
import { seedManualGoal } from '@/test/diary';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const today = localDateOf(new Date());

let seeded = 0;

const logQuick = (daysAgo: number, nutrients: NutrientVector) =>
  insertDiaryEntry(
    api.database(),
    'user-1',
    {
      kind: 'quick',
      date: addDays(today, -daysAgo),
      meal: 'dinner',
      time: null,
      label: 'Dinner',
      nutrients,
    },
    {
      nextId: () => `entry-${++seeded}`,
      now: () => new Date(Date.UTC(2026, 9, 1, 0, seeded)).toISOString(),
    },
  );

const seedMonth = async () => {
  await seedManualGoal(api.database(), { energy_kcal: 2000, protein: 120 });
  await logQuick(20, { energy_kcal: 1800, vitamin_c: 30 });
  await logQuick(10, { energy_kcal: 2200, protein: 100 });
  await logQuick(0, { energy_kcal: 2000 });
  await logQuick(40, { energy_kcal: 9000, iron: 100 });
};

const render = () => renderUi(<NutrientReport />, { wrap: api.wrap });

const terms = () => screen.getAllByRole('term').map((term) => term.textContent);

const row = (label: string) => {
  const term = screen
    .getAllByRole('term')
    .find((candidate) => candidate.textContent === label);
  const element = term?.parentElement?.parentElement;
  if (!element) {
    throw new Error(`No row for ${label}`);
  }
  return element;
};

const meter = (name: string) => screen.queryByRole('meter', { name });

describe('NutrientReport', () => {
  it('averages every nutrient over the logged days of the last 30, with the days that have data', async () => {
    await seedMonth();
    render();

    expect(
      await screen.findByText(/Daily averages over the 3 days logged/),
    ).toBeInTheDocument();
    expect(row('Energy')).toHaveTextContent('2,000 kcal of 2,000 kcal');
    expect(row('Energy')).toHaveTextContent('Data on 3 of 3 days');
    expect(meter('Energy')).toHaveAttribute(
      'aria-valuetext',
      '100%, on target',
    );
    expect(row('Vitamin C')).toHaveTextContent('10 mg of 95 mg');
    expect(row('Vitamin C')).toHaveTextContent('Data on 1 of 3 days');
    expect(row('Iron')).toHaveTextContent(noData);
    expect(row('Iron')).toHaveTextContent('Data on 0 of 3 days');
    expect(meter('Iron')).not.toBeInTheDocument();
  });

  it('sorts by percentage, the targets furthest from reached first and no data last', async () => {
    await seedMonth();
    const { user } = render();

    await screen.findByRole('region', { name: 'Vitamins' });
    expect(terms().slice(0, 3)).toEqual(['Energy', 'Protein', 'Carbohydrate']);

    await user.click(screen.getByRole('button', { name: 'Percentage' }));

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(terms().slice(0, 3)).toEqual(['Vitamin C', 'Protein', 'Energy']);
    expect(terms().at(-1)).toBe('Caffeine');
    expect(row('Caffeine')).toHaveTextContent(noData);
  });

  it('reads the range chosen', async () => {
    await seedMonth();
    const { user } = render();

    await screen.findByText(/over the 3 days logged/);
    await user.click(screen.getByRole('button', { name: '7 days' }));

    expect(
      await screen.findByText(/over the 1 day logged/),
    ).toBeInTheDocument();
    expect(row('Protein')).toHaveTextContent(noData);

    await user.click(screen.getByRole('button', { name: '90 days' }));

    expect(
      await screen.findByText(/over the 4 days logged/),
    ).toBeInTheDocument();
    expect(row('Iron')).toHaveTextContent('Data on 1 of 4 days');
  });

  it('says so when nothing is logged in the range', async () => {
    render();

    expect(
      await screen.findByText('Nothing logged in the last 30 days.'),
    ).toBeInTheDocument();
  });

  it('says so when the report cannot be loaded', async () => {
    api.fails('trends.nutrients');
    render();

    expect(await screen.findByText(loadFailed)).toBeInTheDocument();
  });
});
