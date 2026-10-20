import { expect, test } from '@playwright/test';
import {
  completeOnboarding,
  freshEmail,
  linkMailedTo,
  ready,
  signedInAs,
  signInAs,
  signOut,
  signUp,
} from './auth.ts';

const confirmed = async (page: Parameters<typeof signUp>[0]) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.goto(await linkMailedTo(email, /^Confirm your/));
  return email;
};

test('a new account is sent to onboarding until it has a profile', async ({
  page,
}) => {
  const email = await confirmed(page);
  await expect(page).toHaveURL('/onboarding?next=%2F');

  await page.goto('/settings/profile');
  await expect(page).toHaveURL('/onboarding?next=%2Fsettings%2Fprofile');

  await signOut(page);
  await signInAs(page, email);
  await expect(page).toHaveURL('/onboarding?next=%2F');

  await completeOnboarding(page);
  await expect(page).toHaveURL('/');
  await signedInAs(page, email);

  await page.goto('/onboarding');
  await expect(page).toHaveURL('/');
});

test('someone changes their profile from settings', async ({ page }) => {
  await confirmed(page);
  await completeOnboarding(page);
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/settings');
  await page.getByRole('link', { name: /^Profile/ }).click();
  await expect(page).toHaveURL('/settings/profile');
  await ready(page, 'Save profile');
  await expect(page.getByLabel('Height (cm)')).toHaveValue('168');

  await page.getByLabel('Height (cm)').fill('171');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Height (cm)')).toHaveValue('171');
});
