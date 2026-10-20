import { expect, test } from '@playwright/test';
import { addDays, localDateOf } from '../lib/domain/dates.ts';
import { signInAsDevUser } from './auth.ts';

test('the diary opens on today and keeps the day it moves to in the address', async ({
  page,
}) => {
  const today = localDateOf(new Date());
  await signInAsDevUser(page);

  await page.goto('/diary');
  await expect(page.getByLabel('Date, Today')).toHaveValue(today);
  await expect(page.getByRole('region', { name: 'Breakfast' })).toBeVisible();

  await page.getByRole('button', { name: 'Previous day' }).click();

  const yesterday = addDays(today, -1);
  await expect(page).toHaveURL(`/diary?date=${yesterday}`);
  await expect(page.getByLabel('Date, Yesterday')).toHaveValue(yesterday);

  await page.reload();
  await expect(page.getByLabel('Date, Yesterday')).toHaveValue(yesterday);

  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page).toHaveURL('/diary');
});
