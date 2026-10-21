import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { archiveFailed } from '@/components/foods/archive-food-dialog';
import {
  archived,
  loadFailed,
  noFoodsYet,
  noOwnMatches,
  UserFoods,
} from '@/components/foods/user-foods';
import { Toaster } from '@/components/ui/sonner';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import { serveApi } from '@/test/api';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

let seeded = 0;

const seeding: FoodWriteContext = {
  nextId: () => `seed-${++seeded}`,
  now: () => new Date(Date.UTC(2026, 9, 19, 7)).toISOString(),
};

const seedFood = (name: string, { owner = 'user-1', archived = false } = {}) =>
  insertFood(
    api.database(),
    {
      source: 'user',
      owner_user_id: owner,
      barcode: null,
      name,
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 400 },
      portions: [],
    },
    seeding,
  ).then(async (id) => {
    if (archived) {
      await api
        .database()
        .updateTable('foods')
        .set({ archived_at: '2026-10-19T08:00:00.000Z' })
        .where('id', '=', id)
        .execute();
    }
    return id;
  });

const render = () =>
  renderUi(
    <>
      <UserFoods />
      <Toaster />
    </>,
    { wrap: api.wrap },
  );

const listedNames = () =>
  screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('href')?.startsWith('/foods/seed'))
    .map((link) => link.textContent);

describe('UserFoods', () => {
  it("lists the user's live foods by name, each linking to its edit page", async () => {
    await api
      .database()
      .insertInto('users')
      .values({ id: 'user-2', name: 'user-2', email: 'user-2@example.test' })
      .execute();
    const granola = await seedFood('Granola');
    await seedFood('Banana bread');
    await seedFood('Old muesli', { archived: true });
    await seedFood('Bagel', { owner: 'user-2' });
    render();

    expect(
      await screen.findByRole('link', { name: /Granola/ }),
    ).toHaveAttribute('href', `/foods/${granola}`);
    expect(listedNames()).toEqual([
      expect.stringMatching(/^Banana bread/),
      expect.stringMatching(/^Granola/),
    ]);
    expect(screen.getByRole('link', { name: 'New food' })).toHaveAttribute(
      'href',
      '/foods/new',
    );
  });

  it('searches them', async () => {
    await seedFood('Granola');
    await seedFood('Banana bread');
    const { user } = render();

    await screen.findByRole('link', { name: /Granola/ });
    await user.type(screen.getByLabelText('Search your foods'), 'gran');

    await screen.findByText(/^Granola/);
    await expect
      .poll(() => listedNames())
      .toEqual([expect.stringMatching(/^Granola/)]);

    await user.clear(screen.getByLabelText('Search your foods'));
    await user.type(screen.getByLabelText('Search your foods'), 'pizza');
    expect(await screen.findByText(noOwnMatches('pizza'))).toBeVisible();
  });

  it('archives a food from the list once confirmed', async () => {
    const granola = await seedFood('Granola');
    await seedFood('Banana bread');
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Archive Granola' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Archive Granola?' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText(archived('Granola'))).toBeInTheDocument();
    await expect
      .poll(() => listedNames())
      .toEqual([expect.stringMatching(/^Banana bread/)]);
    expect(
      await api
        .database()
        .selectFrom('foods')
        .select('archived_at')
        .where('id', '=', granola)
        .executeTakeFirst(),
    ).toEqual({ archived_at: expect.any(String) });
  });

  it('keeps the food when archiving is cancelled or fails', async () => {
    await seedFood('Granola');
    api.fails('food.archive');
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Archive Granola' }),
    );
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText(archiveFailed)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('dialog', { name: 'Archive Granola?' }),
    ).not.toBeInTheDocument();
    expect(listedNames()).toEqual([expect.stringMatching(/^Granola/)]);
  });

  it('says where foods will appear before there are any', async () => {
    render();

    expect(await screen.findByText(noFoodsYet)).toBeVisible();
  });

  it('says so when the foods cannot be loaded', async () => {
    api.fails('food.mine');
    render();

    expect(await screen.findByText(loadFailed)).toBeVisible();
  });
});
