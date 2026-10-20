import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { signInAsDevUser, tab } from './auth.ts';

test('the dev user finds every section in settings and their food sources', async ({
  page,
}) => {
  await signInAsDevUser(page);

  await tab(page, 'Settings').click();
  await expect(page).toHaveURL('/settings');
  for (const section of [
    'Profile',
    'Goals',
    'Food sources',
    'Export',
    'Account',
  ]) {
    await expect(
      page.getByRole('link', { name: new RegExp(`^${section}`) }),
    ).toBeVisible();
  }
  await expect(page.getByText('API keys', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: /^Food sources/ }).click();
  await expect(page).toHaveURL('/settings/food-sources');
  await expect(
    page.getByRole('switch', { name: 'Open Food Facts' }),
  ).toBeChecked();
  await expect(page.getByRole('switch', { name: 'CIQUAL' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to settings' }).click();
  await expect(page).toHaveURL('/settings');
});

const download = async (page: Page, name: string) => {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name }).click(),
  ]);
  return {
    name: file.suggestedFilename(),
    text: await readFile(await file.path(), 'utf8'),
  };
};

const byteOrderMark = '\uFEFF';

test('the dev user downloads their diary, weights and everything they logged', async ({
  page,
}) => {
  await signInAsDevUser(page);
  await page.goto('/settings/export');

  await page.getByLabel('From', { exact: true }).fill('2026-10-01');
  await page.getByLabel('To', { exact: true }).fill('2026-10-20');
  const diary = await download(page, 'Diary (CSV)');
  expect(diary.name).toBe(
    'macro-tracker-diary-from-2026-10-01-to-2026-10-20.csv',
  );
  expect(diary.text).toMatch(
    new RegExp(
      `^${byteOrderMark}date,meal,time,label,grams,energy_kcal \\(kcal\\),`,
    ),
  );

  const weights = await download(page, 'Weights (CSV)');
  expect(weights.name).toBe(
    'macro-tracker-weights-from-2026-10-01-to-2026-10-20.csv',
  );
  expect(weights.text.startsWith(`${byteOrderMark}date,weight_kg\r\n`)).toBe(
    true,
  );

  const everything = await download(page, 'Everything (JSON)');
  expect(everything.name).toMatch(/^macro-tracker-\d{4}-\d{2}-\d{2}\.json$/);
  expect(JSON.parse(everything.text)).toMatchObject({
    version: 1,
    profile: { sex: expect.any(String) },
    entries: expect.any(Array),
    measurements: expect.any(Array),
  });
});
