import { expect, test } from '@playwright/test';
import { signInAsDevUser, tab } from './auth.ts';

test('the dev user finds every section in settings and their food sources', async ({
  page,
}) => {
  await signInAsDevUser(page);

  await tab(page, 'Settings').click();
  await expect(page).toHaveURL('/settings');
  for (const section of ['Profile', 'Goals', 'Food sources', 'Account']) {
    await expect(
      page.getByRole('link', { name: new RegExp(`^${section}`) }),
    ).toBeVisible();
  }
  for (const section of ['API keys', 'Export']) {
    await expect(page.getByText(section, { exact: true })).toBeVisible();
  }

  await page.getByRole('link', { name: /^Food sources/ }).click();
  await expect(page).toHaveURL('/settings/food-sources');
  await expect(
    page.getByRole('switch', { name: 'Open Food Facts' }),
  ).toBeChecked();
  await expect(page.getByRole('switch', { name: 'CIQUAL' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to settings' }).click();
  await expect(page).toHaveURL('/settings');
});
