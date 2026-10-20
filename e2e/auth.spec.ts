import { expect, test } from '@playwright/test';
import { e2eGoogleClientId } from '../playwright.config.ts';
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

const confirmation = /^Confirm your/;

test('someone signs up, confirms from the mailed link, signs out and back in', async ({
  page,
}) => {
  const email = freshEmail();

  await signUp(page, email);

  await expect(page.getByText('Confirm your address to finish')).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.goto(await linkMailedTo(email, confirmation));

  await expect(page).toHaveURL('/onboarding?next=%2Fdiary');
  await completeOnboarding(page);
  await expect(page).toHaveURL('/diary');
  await signedInAs(page, email);

  await signOut(page);
  await signInAs(page, email);

  await expect(page).toHaveURL('/diary');
  await signedInAs(page, email);

  await signOut(page);
  await page.goto('/');

  await expect(page).toHaveURL('/sign-in?next=%2Fdiary');
});

test('an unconfirmed address cannot sign in, and is offered the link again', async ({
  page,
}) => {
  const email = freshEmail();
  await signUp(page, email);
  await expect(page.getByText('Confirm your address to finish')).toBeVisible();

  await page.goto('/sign-in');
  await signInAs(page, email);

  await expect(page).toHaveURL(/\/verify\?email=/);
  await page.getByRole('button', { name: 'Send it again' }).click();

  await expect(page.getByText(/On its way/)).toBeVisible();
});

test('a spoiled confirmation link says so and offers a new one', async ({
  page,
}) => {
  await page.goto(
    '/api/auth/verify-email?token=nonsense&callbackURL=%2Fverify',
  );

  await expect(page).toHaveURL('/verify?error=INVALID_TOKEN');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'expired or has been used already',
  );
  await ready(page, 'Send me a new link');
});

test('someone who forgot their password chooses a new one from the mailed link', async ({
  page,
}) => {
  const email = freshEmail();
  const newPassword = 'beans-on-toast-every-day';
  await signUp(page, email);
  await page.goto(await linkMailedTo(email, confirmation));
  await completeOnboarding(page);
  await signOut(page);

  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await ready(page, 'Email me a link');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByText(/If that address has an account/)).toBeVisible();

  await page.goto(await linkMailedTo(email, /^Reset your/));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await ready(page, 'Save new password');
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByLabel('Repeat password').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your password is changed')).toBeVisible();

  await page.getByRole('link', { name: 'Sign in' }).click();
  await signInAs(page, email, newPassword);

  await signedInAs(page, email);
});

test('continuing with Google goes to Google with this app as the client', async ({
  page,
}) => {
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ body: 'Google' }),
  );
  await page.goto('/sign-in?next=%2Fdiary');
  await ready(page, 'Continue with Google');

  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\//);
  const authorization = new URL(page.url());
  expect(authorization.searchParams.get('client_id')).toBe(e2eGoogleClientId);
  expect(authorization.searchParams.get('redirect_uri')).toMatch(
    /\/api\/auth\/callback\/google$/,
  );
});
