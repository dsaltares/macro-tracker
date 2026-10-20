import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  noMatches,
  searchFailed,
  searchPrompt,
} from '@/components/diary/food-search-results';
import { FoodSearchSheet } from '@/components/diary/food-search-sheet';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import { searchPageSize } from '@/lib/domain/foods/search';
import { serveApi } from '@/test/api';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const render = () =>
  renderUi(<FoodSearchSheet meal="lunch" onClose={() => {}} />, {
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
  await insertFood(
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
  await insertFood(
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
};

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
      within(sheet()).getByText('Foods you log appear here.'),
    ).toBeInTheDocument();

    await user.click(within(sheet()).getByRole('tab', { name: 'Frequent' }));
    expect(
      within(sheet()).getByText('The foods you log most often appear here.'),
    ).toBeVisible();

    await user.click(within(sheet()).getByRole('tab', { name: 'Favourites' }));
    expect(
      within(sheet()).getByText('Foods you mark as favourites appear here.'),
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
});
