import { screen, waitFor, within } from '@testing-library/react';
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noGoal } from '@/components/diary/day-totals';
import { DiaryDay, loadFailed } from '@/components/diary/diary-day';
import { clearFailed, copyFailed } from '@/components/diary/meal-menu';
import { Toaster } from '@/components/ui/sonner';
import { listMeasurements } from '@/lib/db/body-measurements';
import { diaryDay } from '@/lib/db/diary';
import { dayTotals } from '@/lib/domain/diary/entries';
import { formatAmount } from '@/lib/domain/nutrition/format';
import { salt } from '@/lib/domain/nutrition/vector';
import { serveApi } from '@/test/api';
import { seedDiaryDay, seedManualGoal } from '@/test/diary';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const day = '2026-10-19';

const render = (search = `?date=${day}`) => {
  const urlUpdates: UrlUpdateEvent[] = [];
  return {
    urlUpdates,
    ...renderUi(<DiaryDay />, {
      wrap: (children) =>
        api.wrap(
          <NuqsTestingAdapter
            searchParams={search}
            hasMemory
            onUrlUpdate={(update) => urlUpdates.push(update)}
          >
            {children}
            <Toaster />
          </NuqsTestingAdapter>,
        ),
    }),
  };
};

const seedDay = (date = day) => seedDiaryDay(api.database(), date);

const meal = (name: string) => screen.getByRole('region', { name });

const totals = () => screen.getByRole('region', { name: 'Day totals' });

const shown = (label: string) => {
  const terms = within(totals()).getAllByRole('term');
  const index = terms.findIndex((term) => term.textContent === label);
  return within(totals()).getAllByRole('definition')[index];
};

const entryIn = (mealName: string, label: string) =>
  within(meal(mealName)).getByRole('button', { name: new RegExp(label) });

const nutrientsIn = (dialog: HTMLElement) =>
  within(dialog).getByRole('region', { name: /^Nutrients/ });

const previewed = (dialog: HTMLElement, label: string) => {
  const terms = within(nutrientsIn(dialog)).getAllByRole('term');
  const index = terms.findIndex((term) => term.textContent === label);
  return within(nutrientsIn(dialog)).getAllByRole('definition')[index];
};

const storedDay = (date = day) => diaryDay(api.database(), 'user-1', date);

afterEach(() => {
  vi.useRealTimers();
});

describe('DiaryDay', () => {
  it('shows an empty day as four empty meals and zero totals', async () => {
    render();

    expect(
      await screen.findByRole('region', { name: 'Breakfast' }),
    ).toBeInTheDocument();
    for (const name of ['Breakfast', 'Lunch', 'Dinner', 'Snack']) {
      expect(
        within(meal(name)).queryByRole('listitem'),
      ).not.toBeInTheDocument();
    }
    expect(shown('Energy')).toHaveTextContent('0 kcal');
    expect(shown('Protein')).toHaveTextContent('0 g');
    expect(shown('Carbs')).toHaveTextContent('0 g');
    expect(shown('Fat')).toHaveTextContent('0 g');
  });

  it('lists each meal’s entries with their amounts and the meal totals', async () => {
    await seedDay();
    render();

    const nutella = await screen.findByRole('button', { name: /Nutella/ });
    expect(nutella).toHaveTextContent('2 × 1 serving');
    expect(nutella).toHaveTextContent('162 kcal');
    expect(nutella).toHaveTextContent('P 1.9 g · C 17.3 g · F 9.3 g');
    expect(entryIn('Breakfast', 'Rolled oats')).toHaveTextContent('1 × 1 cup');
    expect(entryIn('Dinner', "Pizza at Luigi's")).toHaveTextContent(
      'Quick entry',
    );
    expect(meal('Breakfast')).toHaveTextContent(
      '465 kcal · P 12.5 g · C 65.7 g · F 14.5 g',
    );
    expect(
      within(meal('Lunch')).queryByRole('listitem'),
    ).not.toBeInTheDocument();
  });

  it('shows the day totals of the entries, the rest of the label behind a disclosure', async () => {
    await seedDay();
    const { user } = render();
    const expected = dayTotals(await storedDay());

    await screen.findByRole('button', { name: /Nutella/ });

    expect(shown('Energy')).toHaveTextContent(
      formatAmount(expected.energy_kcal ?? Number.NaN, 'kcal'),
    );
    expect(shown('Protein')).toHaveTextContent(
      formatAmount(expected.protein ?? Number.NaN, 'g'),
    );
    expect(shown('Carbs')).toHaveTextContent(
      formatAmount(expected.carbohydrate ?? Number.NaN, 'g'),
    );
    expect(shown('Fat')).toHaveTextContent(
      formatAmount(expected.fat ?? Number.NaN, 'g'),
    );
    expect(screen.getByText('Sugars')).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: 'More nutrients' }));

    expect(shown('Saturates')).toHaveTextContent(
      formatAmount(expected.saturated_fat ?? Number.NaN, 'g'),
    );
    expect(shown('Sugars')).toHaveTextContent(
      formatAmount(expected.sugars ?? Number.NaN, 'g'),
    );
    expect(shown('Fibre')).toHaveTextContent(
      formatAmount(expected.fibre ?? Number.NaN, 'g'),
    );
    expect(shown('Salt')).toHaveTextContent(
      formatAmount(salt(expected.sodium ?? Number.NaN), 'g'),
    );
  });

  it('rings the energy left against the goal and bars each macro, coloured under, on or over target', async () => {
    await seedDay();
    await seedManualGoal(api.database(), {
      energy_kcal: 1500,
      protein: 120,
      carbohydrate: 150,
      fat: 50,
    });
    render();

    expect(
      await screen.findByRole('meter', { name: 'Energy' }),
    ).toHaveAttribute('aria-valuetext', '91%, on target');
    expect(totals()).toHaveTextContent('135 kcal left');
    expect(shown('Energy')).toHaveTextContent('1,365 kcal of 1,500 kcal');
    expect(shown('Protein')).toHaveTextContent('47.5 g of 120 g');
    expect(screen.getByRole('meter', { name: 'Protein' })).toHaveAttribute(
      'aria-valuetext',
      '40%, under target',
    );
    expect(screen.getByRole('meter', { name: 'Carbs' })).toHaveAttribute(
      'aria-valuetext',
      '110%, over target',
    );
    expect(screen.getByRole('meter', { name: 'Fat' })).toHaveAttribute(
      'aria-valuetext',
      '105%, on target',
    );
  });

  it('counts the energy over the goal once the day passes it', async () => {
    await seedDay();
    await seedManualGoal(api.database(), { energy_kcal: 1200 });
    render();

    expect(
      await screen.findByRole('meter', { name: 'Energy' }),
    ).toHaveAttribute('aria-valuetext', '114%, over target');
    expect(totals()).toHaveTextContent('165 kcal over');
  });

  it('shows the totals without progress on a day with no goal', async () => {
    await seedDay();
    render();

    expect(await screen.findByText(noGoal)).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(shown('Energy')).toHaveTextContent('1,365 kcal');
  });

  it('links to every nutrient of the day', async () => {
    render();

    expect(
      await screen.findByRole('link', { name: 'All nutrients' }),
    ).toHaveAttribute('href', `/diary/nutrients?date=${day}`);
  });

  it('opens on today and steps a day at a time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    await seedDay('2026-10-19');
    const { user, urlUpdates } = render('');

    expect(await screen.findByLabelText('Date, Today')).toHaveValue(
      '2026-10-20',
    );
    expect(
      screen.queryByRole('button', { name: /Nutella/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous day' }));

    expect(
      await screen.findByRole('button', { name: /Nutella/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Date, Yesterday')).toHaveValue('2026-10-19');
    expect(urlUpdates.at(-1)?.queryString).toBe('?date=2026-10-19');

    await user.click(screen.getByRole('button', { name: 'Previous day' }));

    expect(
      await screen.findByLabelText('Date, Sun 18 Oct'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next day' }));
    await user.click(screen.getByRole('button', { name: 'Next day' }));

    expect(await screen.findByLabelText('Date, Today')).toBeInTheDocument();
    expect(urlUpdates.at(-1)?.queryString).toBe('');
  });

  it('edits an entry’s quantity, portion, meal and time', async () => {
    const { nutellaEntry } = await seedDay();
    const { user } = render();

    await user.click(await screen.findByRole('button', { name: /Nutella/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Nutella' });
    expect(await within(dialog).findByLabelText('Quantity')).toHaveValue(2);
    expect(within(dialog).getByLabelText('Portion')).toHaveValue('1 serving');
    expect(within(dialog).getByLabelText('Meal')).toHaveValue('breakfast');
    expect(within(dialog).getByLabelText('Time')).toHaveValue('');

    await user.clear(within(dialog).getByLabelText('Quantity'));
    await user.type(within(dialog).getByLabelText('Quantity'), '30');
    await within(dialog).findByRole('option', { name: '1 g' });
    await user.selectOptions(within(dialog).getByLabelText('Portion'), '1 g');
    await user.selectOptions(within(dialog).getByLabelText('Meal'), 'snack');
    await user.type(within(dialog).getByLabelText('Time'), '10:30');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const updated = entryIn('Snack', 'Nutella');
    expect(updated).toHaveTextContent('30 × 1 g');
    expect(updated).toHaveTextContent('162 kcal');
    expect(
      within(meal('Breakfast')).queryByRole('button', { name: /Nutella/ }),
    ).not.toBeInTheDocument();
    expect(
      (await storedDay()).find((entry) => entry.id === nutellaEntry.id),
    ).toMatchObject({
      meal: 'snack',
      time: '10:30',
      quantity: 30,
      portionLabel: '1 g',
      grams: 30,
    });
  });

  it('previews the logged nutrients, then those of a changed amount', async () => {
    await seedDay();
    const { user } = render();

    await user.click(await screen.findByRole('button', { name: /Nutella/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Nutella' });
    await within(dialog).findByLabelText('Quantity');
    expect(nutrientsIn(dialog)).toHaveAccessibleName('Nutrients in 30 g');
    expect(previewed(dialog, 'Energy')).toHaveTextContent('162 kcal');

    await user.clear(within(dialog).getByLabelText('Quantity'));
    await user.type(within(dialog).getByLabelText('Quantity'), '3');

    expect(nutrientsIn(dialog)).toHaveAccessibleName('Nutrients in 45 g');
    expect(previewed(dialog, 'Energy')).toHaveTextContent('243 kcal');
    expect(previewed(dialog, 'Salt')).toHaveTextContent(
      formatAmount(salt(42 * 0.45), 'g'),
    );
  });

  it('moves a quick entry without offering an amount to change', async () => {
    const { pizzaEntry } = await seedDay();
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: /Pizza at Luigi's/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: "Pizza at Luigi's",
    });
    expect(within(dialog).queryByLabelText('Quantity')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Time')).toHaveValue('21:00');
    expect(nutrientsIn(dialog)).toHaveAccessibleName('Nutrients');
    expect(previewed(dialog, 'Energy')).toHaveTextContent('900 kcal');

    await user.selectOptions(within(dialog).getByLabelText('Meal'), 'lunch');
    await user.clear(within(dialog).getByLabelText('Time'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      await within(meal('Lunch')).findByRole('button', { name: /Pizza/ }),
    ).toBeInTheDocument();
    expect(
      (await storedDay()).find((entry) => entry.id === pizzaEntry.id),
    ).toMatchObject({ meal: 'lunch', time: null });
  });

  it('refuses a quantity of zero', async () => {
    await seedDay();
    const { user } = render();

    await user.click(await screen.findByRole('button', { name: /Nutella/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Nutella' });
    await user.clear(await within(dialog).findByLabelText('Quantity'));
    await user.type(within(dialog).getByLabelText('Quantity'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await within(dialog).findByText('Enter a quantity above zero'),
    ).toBeInTheDocument();
    expect(
      (await storedDay()).find((entry) => entry.label === 'Nutella'),
    ).toMatchObject({ quantity: 2 });
  });

  it('deletes an entry', async () => {
    const { oatsEntry } = await seedDay();
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: /Rolled oats/ }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Rolled oats' });
    await user.click(
      await within(dialog).findByRole('button', { name: 'Delete entry' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Rolled oats/ }),
      ).not.toBeInTheDocument(),
    );
    expect((await storedDay()).map(({ id }) => id)).not.toContain(oatsEntry.id);
    expect(meal('Breakfast')).toHaveTextContent('162 kcal');
  });

  it('copies yesterday’s meal into the day, snapshots and all', async () => {
    await seedDay('2026-10-18');
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Breakfast options' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy from yesterday' }),
    );

    expect(
      await screen.findByText('Copied 2 entries from yesterday’s breakfast'),
    ).toBeInTheDocument();
    expect(entryIn('Breakfast', 'Nutella')).toHaveTextContent('162 kcal');
    expect(entryIn('Breakfast', 'Rolled oats')).toBeInTheDocument();
    expect(
      within(meal('Dinner')).queryByRole('listitem'),
    ).not.toBeInTheDocument();
    expect((await storedDay()).map(({ label }) => label)).toEqual([
      'Rolled oats',
      'Nutella',
    ]);
  });

  it('says so when yesterday’s meal is empty', async () => {
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Lunch options' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy from yesterday' }),
    );

    expect(
      await screen.findByText('Nothing to copy: yesterday’s lunch is empty'),
    ).toBeInTheDocument();
    expect(await storedDay()).toEqual([]);
  });

  it('copies a meal to the next day by default, or to the date and meal chosen', async () => {
    await seedDay();
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Breakfast options' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Copy to…' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Copy breakfast',
    });
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-20');
    expect(within(dialog).getByLabelText('Meal')).toHaveValue('breakfast');

    await user.selectOptions(within(dialog).getByLabelText('Meal'), 'lunch');
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(/^Copied 2 entries to lunch, /),
    ).toBeInTheDocument();
    expect(
      (await storedDay('2026-10-20')).map(({ meal, label }) => [meal, label]),
    ).toEqual([
      ['lunch', 'Rolled oats'],
      ['lunch', 'Nutella'],
    ]);
    expect(entryIn('Breakfast', 'Nutella')).toBeInTheDocument();
  });

  it('clears a meal once asked to confirm', async () => {
    await seedDay();
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Breakfast options' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Clear meal' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Clear breakfast?',
    });
    expect(dialog).toHaveTextContent('This deletes its 2 entries.');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(entryIn('Breakfast', 'Nutella')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Breakfast options' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Clear meal' }),
    );
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Clear breakfast?' }),
      ).getByRole('button', { name: 'Clear meal' }),
    );

    await waitFor(() =>
      expect(
        within(meal('Breakfast')).queryByRole('listitem'),
      ).not.toBeInTheDocument(),
    );
    expect((await storedDay()).map(({ label }) => label)).toEqual([
      "Pizza at Luigi's",
    ]);
  });

  it('says so when a meal cannot be copied or cleared', async () => {
    await seedDay();
    api.fails('diary.copyMeal');
    api.fails('diary.clearMeal');
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Breakfast options' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy from yesterday' }),
    );
    expect(await screen.findByText(copyFailed)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Breakfast options' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Clear meal' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Clear breakfast?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Clear meal' }),
    );
    expect(await within(dialog).findByText(clearFailed)).toBeInTheDocument();
    expect(await storedDay()).toHaveLength(3);
  });

  it('offers neither copying nor clearing an empty meal', async () => {
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Lunch options' }),
    );

    expect(
      await screen.findByRole('menuitem', { name: 'Copy to…' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('menuitem', { name: 'Clear meal' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('opens the food search for the meal whose add button was tapped', async () => {
    const { user } = render();

    await user.click(
      await within(
        await screen.findByRole('region', { name: 'Dinner' }),
      ).findByRole('button', { name: 'Add to dinner' }),
    );

    const sheet = await screen.findByRole('dialog', { name: 'Add to dinner' });
    expect(
      within(sheet).getByRole('searchbox', { name: 'Search foods' }),
    ).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('asks for a weight on today only, until today has one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    const { user } = render('');

    expect(
      await screen.findByRole('region', { name: 'Log weight' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous day' }));

    expect(await screen.findByLabelText('Date, Yesterday')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Log weight' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next day' }));
    await user.type(await screen.findByLabelText('Weight (kg)'), '72.4');
    await user.click(screen.getByRole('button', { name: 'Log weight' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Log weight' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await listMeasurements(api.database(), 'user-1', { metric: 'weight_kg' }),
    ).toEqual([expect.objectContaining({ date: '2026-10-20', value: 72.4 })]);
  });

  it('says so when the day cannot be loaded', async () => {
    api.fails('diary.day');
    render();

    expect(await screen.findByText(loadFailed)).toBeInTheDocument();
  });
});
