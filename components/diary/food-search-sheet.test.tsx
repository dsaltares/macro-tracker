import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { addFailed, foodListFailed } from '@/components/diary/food-lists';
import {
  noMatches,
  searchFailed,
  searchPrompt,
} from '@/components/diary/food-search-results';
import { FoodSearchSheet } from '@/components/diary/food-search-sheet';
import { diaryDay, logFood } from '@/lib/db/diary';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import { searchPageSize } from '@/lib/domain/foods/search';
import { serveApi } from '@/test/api';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const date = '2026-10-20';

const render = () =>
  renderUi(<FoodSearchSheet date={date} meal="lunch" onClose={() => {}} />, {
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
  const nutellaId = await insertFood(
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
  const oatsId = await insertFood(
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
  return { nutellaId, oatsId };
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
    {
      date: '2026-10-19',
      meal: 'breakfast',
      time: null,
      foodId,
      portion,
      quantity,
    },
    logging,
  );

const lunchOn = async (day: string) =>
  (await diaryDay(api.database(), 'user-1', day))
    .filter(({ meal }) => meal === 'lunch')
    .map(({ label, quantity, portionLabel }) => ({
      label,
      quantity,
      portionLabel,
    }));

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

const searchFor = async (
  user: ReturnType<typeof render>['user'],
  query: string,
) =>
  user.type(
    within(sheet()).getByRole('searchbox', { name: 'Search foods' }),
    query,
  );

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

  it('offers to create the food or quick add it when nothing matches', async () => {
    await seedFoods();
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'xyzzy');

    expect(
      await within(sheet()).findByText(noMatches('xyzzy')),
    ).toBeInTheDocument();
    expect(
      within(sheet()).getByRole('button', { name: 'Create food' }),
    ).toBeInTheDocument();
    expect(
      within(sheet()).getByRole('button', { name: 'Quick add' }),
    ).toBeInTheDocument();
  });

  it('says so when the search fails', async () => {
    api.fails('food.search');
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'nutella');

    expect(await within(sheet()).findByText(searchFailed)).toBeInTheDocument();
  });

  it('logs a recent food to the meal in one tap, with the portion and quantity it was last logged with', async () => {
    const { nutellaId, oatsId } = await seedFoods();
    await logged(oatsId, '100 g', 1);
    await logged(nutellaId, '1 serving', 2);
    const { user } = render();

    const addNutella = await within(sheet()).findByRole('button', {
      name: 'Add 2 × 1 serving of Nutella',
    });
    expect(
      within(sheet())
        .getAllByRole('button', { name: /^Add / })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Add 2 × 1 serving of Nutella', 'Add 1 × 100 g of Rolled oats']);

    await user.click(addNutella);

    await waitFor(async () =>
      expect(await lunchOn(date)).toEqual([
        { label: 'Nutella', quantity: 2, portionLabel: '1 serving' },
      ]),
    );
  });

  it('lists the foods logged most often on the frequent tab, ready to log again', async () => {
    const { nutellaId, oatsId } = await seedFoods();
    await logged(nutellaId, '1 serving', 1);
    await logged(oatsId, '100 g', 1);
    await logged(oatsId, '1 g', 40);
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await user.click(within(sheet()).getByRole('tab', { name: 'Frequent' }));

    expect(
      (await within(sheet()).findAllByRole('button', { name: /^Add / })).map(
        (button) => button.getAttribute('aria-label'),
      ),
    ).toEqual(['Add 40 × 1 g of Rolled oats', 'Add 1 × 1 serving of Nutella']);
  });

  it('marks the chosen food a favourite, which then lists it with its default portion', async () => {
    await seedFoods();
    const { user } = render();

    await screen.findByRole('dialog', { name: 'Add to lunch' });
    await searchFor(user, 'nutella');
    await user.click(
      await within(sheet()).findByRole('button', { name: /Nutella/ }),
    );
    const favourite = await within(sheet()).findByRole('button', {
      name: 'Favourite',
    });
    await waitFor(() => expect(favourite).toBeEnabled());
    expect(favourite).toHaveAttribute('aria-pressed', 'false');

    await user.click(favourite);
    await waitFor(() =>
      expect(favourite).toHaveAttribute('aria-pressed', 'true'),
    );

    await user.click(
      within(sheet()).getByRole('button', { name: 'Back to search' }),
    );
    await user.click(within(sheet()).getByRole('tab', { name: 'Favourites' }));
    await user.click(
      await within(sheet()).findByRole('button', {
        name: 'Add 1 × 1 serving of Nutella',
      }),
    );

    await waitFor(async () =>
      expect(await lunchOn(date)).toEqual([
        { label: 'Nutella', quantity: 1, portionLabel: '1 serving' },
      ]),
    );
  });

  it('says so when a list cannot be loaded or a food cannot be added', async () => {
    const { nutellaId } = await seedFoods();
    await logged(nutellaId, '1 serving', 2);
    api.fails('diary.addFood');
    const { user } = render();

    await user.click(
      await within(sheet()).findByRole('button', {
        name: 'Add 2 × 1 serving of Nutella',
      }),
    );
    expect(await within(sheet()).findByRole('alert')).toHaveTextContent(
      addFailed,
    );

    api.fails('diary.frequentFoods');
    await user.click(within(sheet()).getByRole('tab', { name: 'Frequent' }));
    expect(
      await within(sheet()).findByText(foodListFailed),
    ).toBeInTheDocument();
  });
});
