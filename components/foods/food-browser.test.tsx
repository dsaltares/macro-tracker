import { screen, within } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPrompt } from '@/components/diary/food-search-results';
import { notFound } from '@/components/diary/scan-step';
import { FoodBrowser } from '@/components/foods/food-browser';
import { Toaster } from '@/components/ui/sonner';
import { diaryDay } from '@/lib/db/diary';
import { insertFood } from '@/lib/db/foods';
import { serveApi } from '@/test/api';
import { fakeCamera } from '@/test/camera';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

const api = serveApi({ signedInAs: 'user-1' });

const render = (search = '') =>
  renderUi(
    <>
      <FoodBrowser />
      <Toaster />
    </>,
    {
      wrap: (children) =>
        api.wrap(
          <NuqsTestingAdapter searchParams={search} hasMemory>
            {children}
          </NuqsTestingAdapter>,
        ),
    },
  );

const seedNutella = () =>
  insertFood(
    api.database(),
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
    {
      nextId: () => 'nutella',
      now: () => new Date(Date.UTC(2026, 9, 19, 7)).toISOString(),
    },
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('FoodBrowser', () => {
  it('asks for a search, then lists the foods that match', async () => {
    await seedNutella();
    const { user } = render();

    expect(screen.getByText(searchPrompt)).toBeInTheDocument();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search foods' }),
      'nute',
    );

    const nutella = await screen.findByRole('button', { name: /Nutella/ });
    expect(nutella).toHaveTextContent('Ferrero · 400 g');
    expect(nutella).toHaveTextContent('539 kcal / 100 g');
  });

  it('adds the chosen food to the day and meal picked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    const nutella = await seedNutella();
    const { user } = render('?q=nutella');

    await user.click(await screen.findByRole('button', { name: /Nutella/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Nutella' });
    expect(within(sheet).getByLabelText('Date')).toHaveValue('2026-10-20');
    expect(within(sheet).getByLabelText('Meal')).toHaveValue('lunch');

    await user.clear(within(sheet).getByLabelText('Date'));
    await user.type(within(sheet).getByLabelText('Date'), '2026-10-19');
    await user.clear(within(sheet).getByLabelText('Quantity'));
    await user.type(within(sheet).getByLabelText('Quantity'), '2');
    await user.selectOptions(within(sheet).getByLabelText('Meal'), 'snack');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Added to snack, Yesterday'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Nutella' }),
    ).not.toBeInTheDocument();
    expect(await diaryDay(api.database(), 'user-1', '2026-10-19')).toEqual([
      expect.objectContaining({
        foodId: nutella,
        meal: 'snack',
        quantity: 2,
        portionLabel: '1 serving',
      }),
    ]);
  });

  it('scans a barcode and opens the food with it', async () => {
    await seedNutella();
    const camera = fakeCamera({ codes: ['3017620422003'] });
    const { user } = render();

    await user.click(screen.getByRole('button', { name: 'Scan a barcode' }));

    expect(
      await screen.findByRole('dialog', { name: 'Nutella' }),
    ).toBeInTheDocument();
    expect(camera.track.stop).toHaveBeenCalled();
  });

  it('offers to create a food with a barcode no food has, or to search by name', async () => {
    fakeCamera({ codes: ['8412345678905'] });
    const { user } = render();

    await user.click(screen.getByRole('button', { name: 'Scan a barcode' }));
    const region = await screen.findByRole('region', {
      name: 'Scan a barcode',
    });

    expect(
      await within(region).findByText(notFound('8412345678905')),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole('link', { name: 'Create food' }),
    ).toHaveAttribute('href', '/foods/new?barcode=8412345678905');

    await user.click(
      within(region).getByRole('button', { name: 'Search by name' }),
    );
    expect(
      screen.getByRole('searchbox', { name: 'Search foods' }),
    ).toBeInTheDocument();
  });
});
