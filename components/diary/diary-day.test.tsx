import { screen, waitFor, within } from '@testing-library/react';
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiaryDay, loadFailed } from '@/components/diary/diary-day';
import { diaryDay, insertDiaryEntry, logFood } from '@/lib/db/diary';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import { dayTotals } from '@/lib/domain/diary/entries';
import { formatAmount } from '@/lib/domain/nutrition/format';
import { salt } from '@/lib/domain/nutrition/vector';
import { serveApi } from '@/test/api';
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
          </NuqsTestingAdapter>,
        ),
    }),
  };
};

const seeding = (): FoodWriteContext => {
  let ids = 0;
  let minutes = 0;
  return {
    nextId: () => `seed-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 19, 7, minutes++)).toISOString(),
  };
};

const logged = (outcome: Awaited<ReturnType<typeof logFood>>) => {
  if (outcome.outcome !== 'logged') {
    throw new Error(`Could not log the fixture: ${outcome.outcome}`);
  }
  return outcome.entry;
};

const seedDay = async (date = day) => {
  const db = api.database();
  const context = seeding();
  const oats = await insertFood(
    db,
    {
      source: 'ciqual',
      source_id: '9310',
      barcode: null,
      name: 'Rolled oats',
      brand: null,
      quantity_label: null,
      nutrients: {
        energy_kcal: 379,
        protein: 13.2,
        carbohydrate: 60.6,
        fat: 6.5,
        fibre: 10.1,
        sugars: 1.1,
        saturated_fat: 1.1,
        sodium: 6,
      },
      portions: [{ label: '1 cup', grams: 80 }],
    },
    context,
  );
  const nutella = await insertFood(
    db,
    {
      source: 'off',
      source_id: '3017620422003',
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      quantity_label: '400 g',
      nutrients: {
        energy_kcal: 539,
        protein: 6.3,
        carbohydrate: 57.5,
        fat: 30.9,
        saturated_fat: 10.6,
        sugars: 56.3,
        sodium: 42,
      },
      portions: [{ label: '1 serving', grams: 15 }],
    },
    context,
  );
  const oatsEntry = logged(
    await logFood(
      db,
      'user-1',
      {
        date,
        meal: 'breakfast',
        time: '08:00',
        foodId: oats,
        portion: '1 cup',
        quantity: 1,
      },
      context,
    ),
  );
  const nutellaEntry = logged(
    await logFood(
      db,
      'user-1',
      {
        date,
        meal: 'breakfast',
        time: null,
        foodId: nutella,
        portion: '1 serving',
        quantity: 2,
      },
      context,
    ),
  );
  const pizzaEntry = await insertDiaryEntry(
    db,
    'user-1',
    {
      kind: 'quick',
      date,
      meal: 'dinner',
      time: '21:00',
      label: "Pizza at Luigi's",
      nutrients: { energy_kcal: 900, protein: 35, carbohydrate: 100, fat: 38 },
    },
    context,
  );
  return { nutellaEntry, oatsEntry, pizzaEntry };
};

const meal = (name: string) => screen.getByRole('region', { name });

const totals = () => screen.getByRole('region', { name: 'Day totals' });

const shown = (label: string) => {
  const terms = within(totals()).getAllByRole('term');
  const index = terms.findIndex((term) => term.textContent === label);
  return within(totals()).getAllByRole('definition')[index];
};

const entryIn = (mealName: string, label: string) =>
  within(meal(mealName)).getByRole('button', { name: new RegExp(label) });

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
    expect(within(dialog).getByLabelText('Quantity')).toHaveValue(2);
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
    await user.clear(within(dialog).getByLabelText('Quantity'));
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
      within(dialog).getByRole('button', { name: 'Delete entry' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Rolled oats/ }),
      ).not.toBeInTheDocument(),
    );
    expect((await storedDay()).map(({ id }) => id)).not.toContain(oatsEntry.id);
    expect(meal('Breakfast')).toHaveTextContent('162 kcal');
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

  it('says so when the day cannot be loaded', async () => {
    api.fails('diary.day');
    render();

    expect(await screen.findByText(loadFailed)).toBeInTheDocument();
  });
});
