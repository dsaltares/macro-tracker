import { expect, test } from '@playwright/test';
import { devUser } from '../lib/auth/dev-user.ts';
import { appTabs } from '../lib/navigation.ts';
import { signInAs, signInAsDevUser, tab } from './auth.ts';

test('the signed-in user walks the four tabs', async ({ page }) => {
  await signInAsDevUser(page);

  for (const { href, label } of appTabs) {
    await tab(page, label).click();

    await expect(page).toHaveURL(href);
    await expect(
      page.getByRole('heading', { name: label, level: 1 }),
    ).toBeVisible();
    await expect(tab(page, label)).toHaveAttribute('aria-current', 'page');
    for (const other of appTabs.filter((each) => each.href !== href)) {
      await expect(tab(page, other.label)).not.toHaveAttribute('aria-current');
    }
  }
});

test('a tab opened signed out goes to sign in, then back to it', async ({
  page,
}) => {
  await page.goto('/trends');
  await expect(page).toHaveURL('/sign-in?next=%2Ftrends');

  await signInAs(page, devUser.email, devUser.password);

  await expect(page).toHaveURL('/trends');
  await expect(tab(page, 'Trends')).toHaveAttribute('aria-current', 'page');
});
