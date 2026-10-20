import { expect, test } from '@playwright/test';
import { siteName } from '../lib/brand.ts';

test('the home page sends someone signed out to sign in', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL('/sign-in?next=%2Fdiary');
  await expect(page).toHaveTitle(`Sign in · ${siteName}`);
  await expect(
    page.getByRole('heading', { name: 'Sign in', level: 1 }),
  ).toBeVisible();
});
