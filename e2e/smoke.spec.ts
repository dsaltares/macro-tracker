import { expect, test } from '@playwright/test';
import { siteName } from '../lib/brand.ts';

test('the home page loads under the app name', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(siteName);
  await expect(
    page.getByRole('heading', { name: siteName, level: 1 }),
  ).toBeVisible();
});
