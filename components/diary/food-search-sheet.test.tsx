import { screen, within } from '@testing-library/react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { portionTaken } from '@/components/diary/entry-form';
import { addAgainFailed, foodListFailed } from '@/components/diary/food-lists';
import {
  noMatches,
  searchFailed,
  searchPrompt,
} from '@/components/diary/food-search-results';
import { FoodSearchSheet } from '@/components/diary/food-search-sheet';
import { addFailed, foodLoadFailed } from '@/components/diary/food-step';
import { enterAnAmount } from '@/components/diary/quick-add-step';
import { lookupFailed, notFound } from '@/components/diary/scan-step';
import {
  cameraDenied,
  cameraFailed,
  noCamera,
} from '@/components/scanner/barcode-scanner';
import { addFavourite, diaryDay, favourites, logFood } from '@/lib/db/diary';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import { searchPageSize } from '@/lib/domain/foods/search';
import { serveApi } from '@/test/api';
import { fakeCamera } from '@/test/camera';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const day = '2026-10-19';

const render = (onClose = () => {}) =>
  renderUi(<FoodSearchSheet date={day} meal="lunch" onClose={onClose} />, {
    wrap: api.wrap,
  });

const seeding = (): FoodWriteContext => {
  let ids = 0;
  return {
    nextId: () => `seed-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 19, 7)).toISOString(),
  };
};

const seedFoods = async () => {
  const db = api.database();
  const context = seeding();
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
      },
      portions: [{ label: '1 serving', grams: 15 }],
    },
    context,
  );
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
      },
      portions: [],
    },
    context,
  );
  return { nutella, oats };
};

let entries = 0;

const logging: FoodWriteContext = {
  nextId: () => `entry-${++entries}`,
  now: () => new Date(Date.UTC(2026, 9, 19, 8, entries)).toISOString(),
};

const logged = async (foodId: string, portion: string, quantity: number) =>
  logFood(
    api.database(),
    'user-1',
    { date: day, meal: 'breakfast', time: null, foodId, portion, quantity },
    logging,
  );

const lunch = async () =>
  (await diaryDay(api.database(), 'user-1', day))
    .filter(({ meal }) => meal === 'lunch')
    .map(({ label, quantity, portionLabel }) => ({
      label,
      quantity,
      portionLabel,
    }));

const addButtonLabels = async () =>
  (await within(sheet()).findAllByRole('button', { name: /^Add .+ of / })).map(
    (button) => button.getAttribute('aria-label'),
  );

const seedApples = async (count: number) => {
  const context = seeding();
  for (let index = 1; index <= count; index++) {
    await insertFood(
      api.database(),
      {
        source: 'usda',
        source_id: `ndb:${index}`,
        barcode: null,
        name: `Apple ${index}`,
        brand: null,
        quantity_label: null,
        nutrients: { energy_kcal: 52 },
        portions: [],
      },
      context,
    );
  }
};

const sheet = () => screen.getByRole('dialog', { name: 'Add to lunch' });

const openNutella = async (user: ReturnType<typeof render>['user']) => {
  await screen.findByRole('dialog', { name: 'Add to lunch' });
  await searchFor(user, 'nutella');
  await user.click(
    await within(sheet()).findByRole('button', { name: /Nutella/ }),
  );
  return within(sheet()).findByRole('region', { name: 'Nutella' });
};

const preview = async (food: HTMLElement) =>
  within(food).findByRole('region', { name: /^Nutrients/ });

const previewed = (region: HTMLElement, label: string) => {
  const terms = within(region).getAllByRole('term');
  const index = terms.findIndex((term) => term.textContent === label);
  return within(region).getAllByRole('definition')[index];
};

const searchFor = async (
  user: ReturnType<typeof render>['user'],
  query: string,
) =>
  user.type(
    within(sheet()).getByRole('searchbox', { name: 'Search foods' }),
    query,
  );

const openQuickAdd = async (
  user: ReturnType<typeof render>['user'],
  query = '',
) => {
  await screen.findByRole('dialog', { name: 'Add to lunch' });
  if (query !== '') {
    await searchFor(user, query);
  }
  await user.click(within(sheet()).getByRole('button', { name: 'Quick add' }));
  return within(sheet()).getByRole('region', { name: 'Quick add' });
};

const userFoods = () =>
  api
    .database()
    .selectFrom('foods')
    .select(['name', 'owner_user_id'])
    .where('source', '=', 'user')
    .execute();

describe('FoodSearchSheet', () => {
  it('opens for its meal on the recent foods, each list empty until there are foods in it', async () => {
    const { user } = render();

    expect(
      await screen.findByRole('dialog', { name: 'Add to lunch' }),
    ).toBeInTheDocument();
    expect(
      within(sheet()).getByRole('tab', { name: 'Recent' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      await within(sheet()).findByText('Foods you log appear here.'),
    ).toBeInTheDocument();

    await user.click(within(sheet()).getByRole('tab', { name: 'Frequent' }));
    expect(
      await within(sheet()).findByText(
        'The foods you log most often appear here.',
      ),
    ).toBeVisible();

    await user.click(within(sheet()).getByRole('tab', { name: 'Favourites' }));
    expect(
      await within(sheet()).findByText(
        'Foods you mark as favourites appear here.',
      ),
    ).toBeVisible();

    await user.click(within(sheet()).getByRole('tab', { name: 'All' }));
    expect(within(sheet()).getByText(searchPrompt)).toBeVisible();
  });

  it('searches once typing pauses, showing each food’s name, brand, quantity, energy per 100 g and source', async () => {
    await seedFoods();
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'nute');

    expect(within(sheet()).getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(sheet()).getByText(searchPrompt)).toBeInTheDocument();

    const nutella = await within(sheet()).findByRole('button', {
      name: /Nutella/,
    });
    expect(nutella).toHaveTextContent('Ferrero · 400 g');
    expect(nutella).toHaveTextContent('539 kcal / 100 g');
    expect(nutella).toHaveTextContent('Open Food Facts');
    expect(
      within(sheet()).queryByRole('button', { name: /Rolled oats/ }),
    ).not.toBeInTheDocument();

    await user.clear(
      within(sheet()).getByRole('searchbox', { name: 'Search foods' }),
    );
    await searchFor(user, 'oats');

    const oats = await within(sheet()).findByRole('button', {
      name: /Rolled oats/,
    });
    expect(oats).toHaveTextContent('379 kcal / 100 g');
    expect(oats).toHaveTextContent('CIQUAL');
  });

  it('loads the next page of results', async () => {
    await seedApples(searchPageSize + 5);
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'apple');

    expect(
      await within(sheet()).findByRole('button', {
        name: 'Apple 1 52 kcal / 100 g USDA',
      }),
    ).toBeInTheDocument();
    expect(
      within(sheet()).getAllByRole('button', { name: /^Apple/ }),
    ).toHaveLength(searchPageSize);

    await user.click(
      within(sheet()).getByRole('button', { name: 'Load more' }),
    );

    expect(
      await within(sheet()).findByRole('button', { name: /^Apple 35/ }),
    ).toBeInTheDocument();
    expect(
      within(sheet()).getAllByRole('button', { name: /^Apple/ }),
    ).toHaveLength(searchPageSize + 5);
    expect(
      within(sheet()).queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument();
  });

  it('renders only the results in view, each saying where it is among them', async () => {
    const viewport = vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(300);
    onTestFinished(() => viewport.mockRestore());
    await seedApples(searchPageSize);
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'apple');

    const first = await within(sheet()).findByRole('button', {
      name: 'Apple 1 52 kcal / 100 g USDA',
    });
    const rendered = within(sheet()).getAllByRole('button', {
      name: /^Apple/,
    });
    expect(rendered.length).toBeLessThan(searchPageSize);
    expect(first.closest('li')).toHaveAttribute(
      'aria-setsize',
      String(searchPageSize),
    );
    expect(first.closest('li')).toHaveAttribute('aria-posinset', '1');
  });

  it('opens the chosen food, and goes back to the same results', async () => {
    await seedFoods();
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'nutella');
    await user.click(
      await within(sheet()).findByRole('button', { name: /Nutella/ }),
    );

    const food = within(sheet()).getByRole('region', { name: 'Nutella' });
    expect(
      within(food).getByRole('heading', { name: 'Nutella' }),
    ).toBeInTheDocument();
    expect(food).toHaveTextContent('539 kcal / 100 g');
    expect(within(sheet()).queryByRole('searchbox')).not.toBeInTheDocument();

    await user.click(
      within(food).getByRole('button', { name: 'Back to search' }),
    );

    expect(
      within(sheet()).getByRole('searchbox', { name: 'Search foods' }),
    ).toHaveValue('nutella');
    expect(
      await within(sheet()).findByRole('button', { name: /Nutella/ }),
    ).toBeInTheDocument();
  });

  it('previews the nutrients of the chosen portion and quantity', async () => {
    await seedFoods();
    const { user } = render();
    const food = await openNutella(user);

    expect(within(food).getByLabelText('Quantity')).toHaveValue(1);
    expect(within(food).getByLabelText('Portion')).toHaveValue('1 serving');
    expect(within(food).getByLabelText('Meal')).toHaveValue('lunch');
    expect(await preview(food)).toHaveAccessibleName('Nutrients in 15 g');
    expect(previewed(await preview(food), 'Energy')).toHaveTextContent(
      '81 kcal',
    );

    await user.clear(within(food).getByLabelText('Quantity'));
    await user.type(within(food).getByLabelText('Quantity'), '2');

    expect(await preview(food)).toHaveAccessibleName('Nutrients in 30 g');
    expect(previewed(await preview(food), 'Energy')).toHaveTextContent(
      '162 kcal',
    );
    expect(previewed(await preview(food), 'Protein')).toHaveTextContent(
      '1.9 g',
    );

    await user.selectOptions(within(food).getByLabelText('Portion'), '100 g');

    expect(await preview(food)).toHaveAccessibleName('Nutrients in 200 g');
    const label = await preview(food);
    expect(previewed(label, 'Energy')).toHaveTextContent('1,078 kcal');
    expect(previewed(label, 'Carbs')).toHaveTextContent('115 g');
    expect(previewed(label, 'Fat')).toHaveTextContent('61.8 g');
    expect(previewed(label, 'Fibre')).toHaveTextContent('—');
  });

  it('logs the food to the day and meal with the chosen amount and time', async () => {
    const { nutella } = await seedFoods();
    const onClose = vi.fn();
    const { user } = render(onClose);
    const food = await openNutella(user);

    await user.clear(within(food).getByLabelText('Quantity'));
    await user.type(within(food).getByLabelText('Quantity'), '1.5');
    await user.selectOptions(within(food).getByLabelText('Meal'), 'snack');
    await user.type(within(food).getByLabelText('Time'), '16:30');
    await user.click(within(food).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await diaryDay(api.database(), 'user-1', day)).toEqual([
      expect.objectContaining({
        kind: 'food',
        foodId: nutella,
        label: 'Nutella',
        meal: 'snack',
        time: '16:30',
        quantity: 1.5,
        portionLabel: '1 serving',
        grams: 22.5,
      }),
    ]);
  });

  it('logs no time when none is given, and refuses a quantity of zero', async () => {
    await seedFoods();
    const onClose = vi.fn();
    const { user } = render(onClose);
    const food = await openNutella(user);

    await user.clear(within(food).getByLabelText('Quantity'));
    await user.type(within(food).getByLabelText('Quantity'), '0');
    await user.click(within(food).getByRole('button', { name: 'Save' }));

    expect(
      await within(food).findByText('Enter a quantity above zero'),
    ).toBeInTheDocument();

    await user.clear(within(food).getByLabelText('Quantity'));
    await user.type(within(food).getByLabelText('Quantity'), '1');
    await user.click(within(food).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await diaryDay(api.database(), 'user-1', day)).toEqual([
      expect.objectContaining({ meal: 'lunch', time: null, quantity: 1 }),
    ]);
  });

  it('adds a portion inline and chooses it', async () => {
    await seedFoods();
    const { user } = render();
    const food = await openNutella(user);

    await user.clear(within(food).getByLabelText('Quantity'));
    await user.type(within(food).getByLabelText('Quantity'), '2');
    await user.selectOptions(within(food).getByLabelText('Meal'), 'snack');
    await user.click(within(food).getByRole('button', { name: 'Add portion' }));
    const adder = within(food).getByRole('group', { name: 'Add portion' });
    await user.type(within(adder).getByLabelText('Label'), '1 slice of toast');
    await user.type(within(adder).getByLabelText('Grams'), '20');
    await user.click(within(adder).getByRole('button', { name: 'Add' }));

    expect(
      await within(food).findByRole('option', { name: '1 slice of toast' }),
    ).toBeInTheDocument();
    expect(within(food).getByLabelText('Portion')).toHaveValue(
      '1 slice of toast',
    );
    expect(within(food).getByLabelText('Quantity')).toHaveValue(2);
    expect(within(food).getByLabelText('Meal')).toHaveValue('snack');
    expect(await preview(food)).toHaveAccessibleName('Nutrients in 40 g');
    expect(
      within(food).queryByRole('group', { name: 'Add portion' }),
    ).not.toBeInTheDocument();

    await user.click(within(food).getByRole('button', { name: 'Add portion' }));
    const again = within(food).getByRole('group', { name: 'Add portion' });
    await user.type(within(again).getByLabelText('Label'), '1 serving');
    await user.type(within(again).getByLabelText('Grams'), '15{Enter}');

    expect(await within(again).findByText(portionTaken)).toBeInTheDocument();
  });

  it('marks the food a favourite and unmarks it', async () => {
    const { nutella } = await seedFoods();
    const { user } = render();
    const food = await openNutella(user);

    const favourite = await within(food).findByRole('button', {
      name: 'Favourite',
      pressed: false,
    });
    await vi.waitFor(() => expect(favourite).toBeEnabled());
    await user.click(favourite);

    await vi.waitFor(() =>
      expect(favourite).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(await favourites(api.database(), 'user-1')).toEqual([
      expect.objectContaining({ foodId: nutella }),
    ]);

    await vi.waitFor(() => expect(favourite).toBeEnabled());
    await user.click(favourite);

    await vi.waitFor(() =>
      expect(favourite).toHaveAttribute('aria-pressed', 'false'),
    );
    expect(await favourites(api.database(), 'user-1')).toEqual([]);
  });

  it('says so when the entry cannot be saved', async () => {
    await seedFoods();
    api.fails('diary.addFood');
    const onClose = vi.fn();
    const { user } = render(onClose);
    const food = await openNutella(user);

    await user.click(within(food).getByRole('button', { name: 'Save' }));

    expect(await within(food).findByText(addFailed)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers to create the food or quick add it when nothing matches', async () => {
    await seedFoods();
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'xyzzy');

    expect(
      await within(sheet()).findByText(noMatches('xyzzy')),
    ).toBeInTheDocument();
    expect(
      within(sheet()).getByRole('link', { name: 'Create food' }),
    ).toHaveAttribute('href', `/foods/new?date=${day}&meal=lunch`);
    expect(
      within(sheet()).getByRole('button', { name: 'Quick add' }),
    ).toBeInTheDocument();
  });

  it('opens straight on a food just created for the meal, and logs it', async () => {
    const { oats } = await seedFoods();
    const onClose = vi.fn();
    const { user } = renderUi(
      <FoodSearchSheet
        date={day}
        meal="lunch"
        createdFoodId={oats}
        onClose={onClose}
      />,
      { wrap: api.wrap },
    );

    const food = await within(
      await screen.findByRole('dialog', { name: 'Add to lunch' }),
    ).findByRole('region', { name: 'Rolled oats' });
    await user.click(within(food).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await lunch()).toEqual([
      { label: 'Rolled oats', quantity: 1, portionLabel: '100 g' },
    ]);
  });

  it('goes back to search from a food just created, or one that cannot be loaded', async () => {
    const { user } = renderUi(
      <FoodSearchSheet
        date={day}
        meal="lunch"
        createdFoodId="missing"
        onClose={() => {}}
      />,
      { wrap: api.wrap },
    );

    expect(
      await within(
        await screen.findByRole('dialog', { name: 'Add to lunch' }),
      ).findByText(foodLoadFailed),
    ).toBeInTheDocument();

    await user.click(
      within(sheet()).getByRole('button', { name: 'Back to search' }),
    );

    expect(
      within(sheet()).getByRole('searchbox', { name: 'Search foods' }),
    ).toBeInTheDocument();
  });

  it('quick adds amounts per 100 g for the grams eaten, named after the search', async () => {
    const onClose = vi.fn();
    const { user } = render(onClose);
    const quick = await openQuickAdd(user, 'flapjack');

    expect(within(quick).getByLabelText('Label')).toHaveValue('flapjack');
    expect(
      within(quick).getByRole('button', { name: 'Per 100 g', pressed: true }),
    ).toBeInTheDocument();
    await user.type(within(quick).getByLabelText('Protein (g)'), '6');
    await user.type(within(quick).getByLabelText('Fat (g)'), '20');
    await user.type(within(quick).getByLabelText('Carbs (g)'), '55');
    await user.type(within(quick).getByLabelText('Grams eaten'), '50');

    expect(await preview(quick)).toHaveAccessibleName('Nutrients in 50 g');
    expect(previewed(await preview(quick), 'Energy')).toHaveTextContent(
      '212 kcal',
    );
    expect(previewed(await preview(quick), 'Fat')).toHaveTextContent('10 g');

    await user.click(within(quick).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await diaryDay(api.database(), 'user-1', day)).toEqual([
      expect.objectContaining({
        kind: 'quick',
        label: 'flapjack',
        meal: 'lunch',
        time: null,
        nutrients: {
          protein: 3,
          fat: 10,
          carbohydrate: 27.5,
          energy_kcal: 212,
        },
      }),
    ]);
    expect(await userFoods()).toEqual([]);
  });

  it('quick adds totals, energy alone enough', async () => {
    const onClose = vi.fn();
    const { user } = render(onClose);
    const quick = await openQuickAdd(user);

    await user.type(within(quick).getByLabelText('Label'), 'Birthday cake');
    await user.click(within(quick).getByRole('button', { name: 'Totals' }));
    expect(
      within(quick).queryByLabelText('Grams eaten'),
    ).not.toBeInTheDocument();
    expect(
      within(quick).queryByRole('switch', { name: 'Save as my food' }),
    ).not.toBeInTheDocument();

    await user.click(within(quick).getByRole('button', { name: 'Save' }));
    expect(await within(quick).findByText(enterAnAmount)).toBeInTheDocument();

    await user.type(within(quick).getByLabelText('Energy (kcal)'), '450');
    expect(await preview(quick)).toHaveAccessibleName('Nutrients');
    await user.selectOptions(within(quick).getByLabelText('Meal'), 'snack');
    await user.type(within(quick).getByLabelText('Time'), '17:00');
    await user.click(within(quick).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await diaryDay(api.database(), 'user-1', day)).toEqual([
      expect.objectContaining({
        kind: 'quick',
        label: 'Birthday cake',
        meal: 'snack',
        time: '17:00',
        nutrients: { energy_kcal: 450 },
      }),
    ]);
  });

  it('asks for the macros, the grams eaten and a label per 100 g', async () => {
    const { user } = render();
    const quick = await openQuickAdd(user);

    await user.click(within(quick).getByRole('button', { name: 'Save' }));

    expect(await within(quick).findByText('Enter a label')).toBeInTheDocument();
    expect(within(quick).getAllByText('Enter an amount')).toHaveLength(3);
    expect(
      within(quick).getByText('Enter the grams eaten'),
    ).toBeInTheDocument();
    expect(await diaryDay(api.database(), 'user-1', day)).toEqual([]);
  });

  it('saves a quick add as a food of the user’s own, found by search', async () => {
    const onClose = vi.fn();
    const { user } = render(onClose);
    const quick = await openQuickAdd(user, 'Granny’s flapjack');

    await user.type(within(quick).getByLabelText('Protein (g)'), '6');
    await user.type(within(quick).getByLabelText('Fat (g)'), '20');
    await user.type(within(quick).getByLabelText('Carbs (g)'), '55');
    await user.type(within(quick).getByLabelText('Energy (kcal)'), '430');
    await user.type(within(quick).getByLabelText('Grams eaten'), '50');
    await user.click(
      within(quick).getByRole('switch', { name: 'Save as my food' }),
    );
    await user.click(within(quick).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await diaryDay(api.database(), 'user-1', day)).toEqual([
      expect.objectContaining({
        kind: 'quick',
        nutrients: {
          protein: 3,
          fat: 10,
          carbohydrate: 27.5,
          energy_kcal: 215,
        },
      }),
    ]);
    expect(await userFoods()).toEqual([
      { name: 'Granny’s flapjack', owner_user_id: 'user-1' },
    ]);
  });

  it('says so when the quick entry cannot be saved', async () => {
    api.fails('diary.addQuick');
    const onClose = vi.fn();
    const { user } = render(onClose);
    const quick = await openQuickAdd(user, 'Cake');

    await user.click(within(quick).getByRole('button', { name: 'Totals' }));
    await user.type(within(quick).getByLabelText('Energy (kcal)'), '300');
    await user.click(within(quick).getByRole('button', { name: 'Save' }));

    expect(await within(quick).findByText(addFailed)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('goes back from quick add to the same search', async () => {
    const { user } = render();
    const quick = await openQuickAdd(user, 'xyzzy');

    await user.click(
      within(quick).getByRole('button', { name: 'Back to search' }),
    );

    expect(
      within(sheet()).getByRole('searchbox', { name: 'Search foods' }),
    ).toHaveValue('xyzzy');
  });

  it('says so when the search fails', async () => {
    api.fails('food.search');
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'nutella');

    expect(await within(sheet()).findByText(searchFailed)).toBeInTheDocument();
  });

  it('logs a recent food to the meal in one tap, with the portion and quantity it was last logged with', async () => {
    const { nutella, oats } = await seedFoods();
    await logged(oats, '100 g', 1);
    await logged(nutella, '1 serving', 2);
    const { user } = render();

    expect(await addButtonLabels()).toEqual([
      'Add 2 × 1 serving of Nutella',
      'Add 1 × 100 g of Rolled oats',
    ]);

    await user.click(
      within(sheet()).getByRole('button', {
        name: 'Add 2 × 1 serving of Nutella',
      }),
    );

    await vi.waitFor(async () =>
      expect(await lunch()).toEqual([
        { label: 'Nutella', quantity: 2, portionLabel: '1 serving' },
      ]),
    );
  });

  it('lists the foods logged most often on the frequent tab, ready to log again', async () => {
    const { nutella, oats } = await seedFoods();
    await logged(nutella, '1 serving', 1);
    await logged(oats, '100 g', 1);
    await logged(oats, '1 g', 40);
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await user.click(within(sheet()).getByRole('tab', { name: 'Frequent' }));

    expect(await addButtonLabels()).toEqual([
      'Add 40 × 1 g of Rolled oats',
      'Add 1 × 1 serving of Nutella',
    ]);
  });

  it('lists the favourites, each ready to log with its default portion until it is logged', async () => {
    const { nutella } = await seedFoods();
    await addFavourite(api.database(), 'user-1', nutella, logging.now);
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await user.click(within(sheet()).getByRole('tab', { name: 'Favourites' }));
    await user.click(
      await within(sheet()).findByRole('button', {
        name: 'Add 1 × 1 serving of Nutella',
      }),
    );

    await vi.waitFor(async () =>
      expect(await lunch()).toEqual([
        { label: 'Nutella', quantity: 1, portionLabel: '1 serving' },
      ]),
    );
  });

  it('says so when a list cannot be loaded or a food cannot be added again', async () => {
    const { nutella } = await seedFoods();
    await logged(nutella, '1 serving', 2);
    api.fails('diary.addFood');
    const { user } = render();

    await user.click(
      await within(sheet()).findByRole('button', {
        name: 'Add 2 × 1 serving of Nutella',
      }),
    );
    expect(await within(sheet()).findByRole('alert')).toHaveTextContent(
      addAgainFailed,
    );

    api.fails('diary.frequentFoods');
    await user.click(within(sheet()).getByRole('tab', { name: 'Frequent' }));
    expect(
      await within(sheet()).findByText(foodListFailed),
    ).toBeInTheDocument();
  });

  describe('scanning a barcode', () => {
    const scanner = () =>
      within(sheet()).findByRole('region', { name: 'Scan a barcode' });

    const openScanner = async (user: ReturnType<typeof render>['user']) => {
      await screen.findByRole('dialog', { name: 'Add to lunch' });
      await user.click(
        within(sheet()).getByRole('button', { name: 'Scan a barcode' }),
      );
      return scanner();
    };

    it('opens the food with that barcode and stops the camera', async () => {
      await seedFoods();
      const camera = fakeCamera({ codes: ['3017620422003'] });
      const { user } = render();

      await openScanner(user);

      const food = await within(sheet()).findByRole('region', {
        name: 'Nutella',
      });
      expect(
        await within(food).findByRole('button', { name: 'Save' }),
      ).toBeInTheDocument();
      expect(camera.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: { facingMode: { ideal: 'environment' } },
        }),
      );
      expect(camera.track.stop).toHaveBeenCalled();
    });

    it('finds a UPC-A barcode under its EAN-13', async () => {
      await insertFood(
        api.database(),
        {
          source: 'off',
          source_id: '0035650166738',
          barcode: '0035650166738',
          name: 'Peanut butter',
          brand: null,
          quantity_label: null,
          nutrients: { energy_kcal: 588 },
          portions: [],
        },
        seeding(),
      );
      fakeCamera({ codes: ['035650166738'] });
      const { user } = render();

      await openScanner(user);

      expect(
        await within(sheet()).findByRole('region', { name: 'Peanut butter' }),
      ).toBeInTheDocument();
    });

    it('offers to search by name, create the food or scan its label when no food has the barcode', async () => {
      await seedFoods();
      const camera = fakeCamera({ codes: ['8412345678905'] });
      const { user } = render();

      const region = await openScanner(user);

      expect(
        await within(region).findByText(notFound('8412345678905')),
      ).toBeInTheDocument();
      expect(camera.track.stop).toHaveBeenCalled();
      expect(
        within(region).getByRole('link', { name: 'Create food' }),
      ).toHaveAttribute(
        'href',
        `/foods/new?barcode=8412345678905&date=${day}&meal=lunch`,
      );
      expect(
        within(region).getByRole('link', { name: 'Scan the label' }),
      ).toHaveAttribute(
        'href',
        `/foods/new?barcode=8412345678905&scan=label&date=${day}&meal=lunch`,
      );

      await user.click(
        within(region).getByRole('button', { name: 'Search by name' }),
      );

      expect(
        within(sheet()).getByRole('searchbox', { name: 'Search foods' }),
      ).toBeInTheDocument();
    });

    it('scans again after a miss', async () => {
      const camera = fakeCamera({ codes: ['8412345678905'] });
      const { user } = render();

      const region = await openScanner(user);
      await within(region).findByText(notFound('8412345678905'));
      await user.click(
        within(region).getByRole('button', { name: 'Scan again' }),
      );

      expect(
        await within(region).findByLabelText('Camera'),
      ).toBeInTheDocument();
      expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    });

    it('says so when the camera is blocked', async () => {
      fakeCamera({ error: 'NotAllowedError' });
      const { user } = render();

      const region = await openScanner(user);

      expect(await within(region).findByText(cameraDenied)).toBeInTheDocument();
    });

    it('says so when there is no camera', async () => {
      fakeCamera({ error: 'NotFoundError' });
      const { user } = render();

      const region = await openScanner(user);

      expect(await within(region).findByText(noCamera)).toBeInTheDocument();
    });

    it('says so when the camera cannot be started', async () => {
      fakeCamera({ error: 'NotReadableError' });
      const { user } = render();

      const region = await openScanner(user);

      expect(await within(region).findByText(cameraFailed)).toBeInTheDocument();
    });

    it('turns the torch on and off where the camera has one', async () => {
      const camera = fakeCamera({ torch: true });
      const { user } = render();

      const region = await openScanner(user);
      const torch = await within(region).findByRole('button', {
        name: 'Torch',
      });
      await user.click(torch);

      expect(camera.track.applyConstraints).toHaveBeenCalledWith({
        advanced: [{ torch: true }],
      });
      expect(torch).toHaveAttribute('aria-pressed', 'true');

      await user.click(torch);

      expect(camera.track.applyConstraints).toHaveBeenLastCalledWith({
        advanced: [{ torch: false }],
      });
      expect(torch).toHaveAttribute('aria-pressed', 'false');
    });

    it('offers no torch where the camera has none', async () => {
      fakeCamera();
      const { user } = render();

      const region = await openScanner(user);

      expect(
        await within(region).findByText('Point the camera at a barcode.'),
      ).toBeInTheDocument();
      expect(
        within(region).queryByRole('button', { name: 'Torch' }),
      ).not.toBeInTheDocument();
    });

    it('says so when the barcode cannot be looked up', async () => {
      api.fails('food.byBarcode');
      fakeCamera({ codes: ['3017620422003'] });
      const { user } = render();

      const region = await openScanner(user);

      expect(await within(region).findByText(lookupFailed)).toBeInTheDocument();
    });

    it('goes back to search, stopping the camera', async () => {
      const camera = fakeCamera();
      const { user } = render();

      const region = await openScanner(user);
      await within(region).findByText('Point the camera at a barcode.');
      await user.click(
        within(region).getByRole('button', { name: 'Back to search' }),
      );

      expect(
        within(sheet()).getByRole('searchbox', { name: 'Search foods' }),
      ).toBeInTheDocument();
      expect(camera.track.stop).toHaveBeenCalled();
    });
  });
});
