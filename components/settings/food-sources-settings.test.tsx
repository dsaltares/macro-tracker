import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  FoodSourcesSettings,
  saveFailed,
} from '@/components/settings/food-sources-settings';
import { listFoodSources } from '@/lib/db/food-source-preferences';
import { serveApi } from '@/test/api';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const render = () => renderUi(<FoodSourcesSettings />, { wrap: api.wrap });

const savedPreferences = async () =>
  (await listFoodSources(api.database(), 'user-1')).map(
    ({ source, enabled }) => [source, enabled],
  );

const inOrder = (names: string[]) =>
  expect(screen.getAllByRole('switch')).toEqual(
    names.map((name) => screen.getByRole('switch', { name })),
  );

const isLocked = (name: string) =>
  expect(screen.getByRole('switch', { name })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

describe('FoodSourcesSettings', () => {
  it('lists every source, with Open Food Facts always on and the rest enabled', async () => {
    render();

    expect(
      await screen.findByRole('switch', { name: 'Open Food Facts' }),
    ).toBeChecked();
    isLocked('Open Food Facts');
    expect(screen.getByText('Always on · 0 foods')).toBeInTheDocument();
    for (const name of ['CIQUAL', 'CoFID', 'USDA FoodData Central']) {
      expect(screen.getByRole('switch', { name })).toBeChecked();
      expect(screen.getByRole('switch', { name })).not.toHaveAttribute(
        'aria-disabled',
      );
    }
  });

  it('turns a source off, and it stays off', async () => {
    const { user, unmount } = render();

    await user.click(await screen.findByRole('switch', { name: 'CIQUAL' }));

    await expect.poll(savedPreferences).toEqual([
      ['off', true],
      ['ciqual', false],
      ['cofid', true],
      ['usda', true],
    ]);
    expect(screen.getByRole('switch', { name: 'CIQUAL' })).not.toBeChecked();

    unmount();
    render();

    expect(
      await screen.findByRole('switch', { name: 'CIQUAL' }),
    ).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'CoFID' })).toBeChecked();
  });

  it('moves a source up the list', async () => {
    const { user } = render();

    await user.click(
      await screen.findByRole('button', {
        name: 'Move USDA FoodData Central up',
      }),
    );

    await waitFor(() =>
      inOrder(['Open Food Facts', 'CIQUAL', 'USDA FoodData Central', 'CoFID']),
    );
    expect((await savedPreferences()).map(([source]) => source)).toEqual([
      'off',
      'ciqual',
      'usda',
      'cofid',
    ]);
    expect(
      screen.getByRole('button', { name: 'Move CIQUAL up' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move CoFID down' }),
    ).toBeDisabled();
  });

  it('says so when a change cannot be saved', async () => {
    api.fails('food.setSourcePreferences');
    const { user } = render();

    await user.click(await screen.findByRole('switch', { name: 'CoFID' }));

    expect(await screen.findByText(saveFailed)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'CoFID' })).toBeChecked();
  });
});
