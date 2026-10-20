import { expect, test } from '@playwright/test';
import {
  completeOnboarding,
  freshEmail,
  linkMailedTo,
  signInAs,
  signUp,
} from './auth.ts';

test('someone deletes their account, and can no longer sign in', async ({
  page,
}) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.goto(await linkMailedTo(email, /^Confirm your/));
  await completeOnboarding(page);

  await page.goto('/settings');
  await page.getByRole('link', { name: /^Account/ }).click();
  await expect(page).toHaveURL('/settings/account');
  const remove = page.getByRole('button', { name: 'Delete account' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Type your email address to confirm').fill(email);
  await remove.click();

  await expect(page).toHaveURL('/sign-in');
  await signInAs(page, email);
  await expect(
    page.getByText('That email and password do not match an account.'),
  ).toBeVisible();
  await page.goto('/settings');
  await expect(page).toHaveURL('/sign-in?next=%2Fsettings');
});

test('a password account shows its password connected and Google not', async ({
  page,
}) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.goto(await linkMailedTo(email, /^Confirm your/));
  await completeOnboarding(page);

  await page.goto('/settings/account');

  const methods = page.getByRole('region', { name: 'Sign-in methods' });
  const password = methods.getByRole('listitem', { name: 'Password' });
  const google = methods.getByRole('listitem', { name: 'Google' });
  await expect(password).toContainText('Connected');
  await expect(password).toContainText('Your only way to sign in');
  await expect(
    password.getByRole('button', { name: 'Disconnect Password' }),
  ).toBeDisabled();
  await expect(google).toContainText('Not connected');
  await expect(
    google.getByRole('button', { name: 'Connect Google' }),
  ).toBeVisible();
  await expect(page.getByRole('form', { name: 'Set a password' })).toHaveCount(
    0,
  );
});
