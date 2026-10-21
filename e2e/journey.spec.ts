import { expect, test } from '@playwright/test';
import {
  completeOnboarding,
  freshEmail,
  linkMailedTo,
  signUp,
} from './auth.ts';

test('someone logs breakfast from search, sees the totals and copies it to tomorrow', async ({
  page,
}) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.goto(await linkMailedTo(email, /^Confirm your/));
  await completeOnboarding(page);
  await expect(page).toHaveURL('/diary');

  const breakfast = page.getByRole('region', { name: 'Breakfast' });
  await breakfast.getByRole('button', { name: 'Add to breakfast' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add to breakfast' });
  await sheet.getByRole('searchbox', { name: 'Search foods' }).fill('nutella');
  await sheet.getByRole('button', { name: /^Nutella Ferrero/ }).click();
  const food = sheet.getByRole('region', { name: 'Nutella' });
  await food.getByLabel('Portion').selectOption('1 g');
  await food.getByLabel('Quantity').fill('20');
  await expect(
    food.getByRole('region', { name: 'Nutrients in 20 g' }),
  ).toContainText('108 kcal');
  await food.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  const entry = breakfast.getByRole('button', { name: /^Nutella/ });
  await expect(entry).toContainText('20 × 1 g');
  await expect(breakfast).toContainText(
    '108 kcal · P 1.3 g · C 11.5 g · F 6.2 g',
  );
  const totals = page.getByRole('region', { name: 'Day totals' });
  await expect(totals).toContainText('108 kcal');

  await breakfast.getByRole('button', { name: 'Breakfast options' }).click();
  await page.getByRole('menuitem', { name: 'Copy to…' }).click();
  const copy = page.getByRole('dialog', { name: 'Copy breakfast' });
  await copy.getByRole('button', { name: 'Copy' }).click();
  await expect(copy).toBeHidden();
  await expect(
    page.getByText('Copied 1 entry to breakfast, Tomorrow'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByLabel('Date, Tomorrow')).toBeVisible();
  await expect(
    breakfast.getByRole('button', { name: /^Nutella/ }),
  ).toContainText('20 × 1 g');
  await expect(breakfast).toContainText('108 kcal');
  await expect(totals).toContainText('108 kcal');
});
