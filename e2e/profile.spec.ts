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
  tab,
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
  await expect(page).toHaveURL('/onboarding?next=%2Fdiary');

  await page.goto('/settings/profile');
  await expect(page).toHaveURL('/onboarding?next=%2Fsettings%2Fprofile');

  await signOut(page);
  await signInAs(page, email);
  await expect(page).toHaveURL('/onboarding?next=%2Fdiary');

  await completeOnboarding(page);
  await expect(page).toHaveURL('/diary');
  await signedInAs(page, email);

  await page.goto('/onboarding');
  await expect(page).toHaveURL('/diary');
});

test('onboarding asks for goals after the profile, and settings keeps them', async ({
  page,
}) => {
  await confirmed(page);
  await expect(page).toHaveURL('/onboarding?next=%2Fdiary');

  await page.goto('/onboarding/goals?next=%2Fdiary');
  await expect(page).toHaveURL('/onboarding?next=%2Fdiary');

  await completeOnboarding(page);
  await expect(page).toHaveURL('/diary');

  await page.goto('/settings/goals');
  await ready(page, 'Save goals');
  await expect(page.getByLabel('Protein (g per kg)')).toHaveValue('1.6');
  await page.getByLabel('Vitamin C (mg)').fill('200');
  await page.getByRole('button', { name: 'Save goals' }).click();
  await expect(page.getByText('Goals saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Vitamin C (mg)')).toHaveValue('200');
  await expect(
    page.getByRole('button', { name: 'Reset Vitamin C' }),
  ).toBeVisible();
});

test('someone changes their profile from settings', async ({ page }) => {
  await confirmed(page);
  await completeOnboarding(page);
  await expect(page).toHaveURL('/diary');

  await tab(page, 'Settings').click();
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
