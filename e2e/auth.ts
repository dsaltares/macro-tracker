import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { devUser } from '../lib/auth/dev-user.ts';
import { readOutbox } from '../lib/email/outbox.ts';
import { e2eOutboxDir } from '../playwright.config.ts';

export const consentLabel = /I agree to the terms/;

export const password = 'lentils-and-rice-forever';

export const freshEmail = () => `eater-${randomUUID()}@example.test`;

const linkPattern = /https?:\/\/\S+/;

export const linkMailedTo = async (email: string, subject: RegExp) => {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const mail = (await readOutbox(e2eOutboxDir))
        .filter(
          (message) => message.to === email && subject.test(message.subject),
        )
        .at(-1);
      link = mail?.text.match(linkPattern)?.[0];
      return link;
    })
    .toBeDefined();
  return link as string;
};

export const ready = (page: Page, submit: string) =>
  expect(page.getByRole('button', { name: submit, exact: true })).toBeEnabled();

export const signUp = async (page: Page, email: string) => {
  await page.goto('/sign-up');
  await ready(page, 'Create account');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Repeat password').fill(password);
  await page.getByRole('checkbox', { name: consentLabel }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
};

export const signInAs = async (
  page: Page,
  email: string,
  secret = password,
) => {
  await ready(page, 'Sign in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};

export const signInAsDevUser = async (page: Page) => {
  await page.goto('/sign-in');
  await signInAs(page, devUser.email, devUser.password);
  await signedInAs(page, devUser.email);
};

export const completeOnboarding = async (page: Page) => {
  await expect(page).toHaveURL(/^[^?]*\/onboarding/);
  await ready(page, 'Continue');
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.getByLabel('Date of birth').fill('1990-06-15');
  await page.getByLabel('Height (cm)').fill('168');
  await page.getByRole('radio', { name: /^Moderate/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/^[^?]*\/onboarding\/goals/);
  await ready(page, 'Continue');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).not.toHaveURL(/\/onboarding/);
};

export const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

export const signedInAs = async (page: Page, email: string) => {
  await tab(page, 'Settings').click();
  await expect(page).toHaveURL('/settings');
  await expect(
    page.getByText(email, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
};

export const signOut = async (page: Page) => {
  await page.goto('/settings');
  const accountMenu = page.getByRole('button', { name: 'Account' });
  const signOutButton = page.getByRole('button', { name: 'Sign out' });
  await expect(accountMenu.or(signOutButton)).toBeVisible();
  if (await accountMenu.isVisible()) {
    await accountMenu.click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
  } else {
    await signOutButton.click();
  }
  await expect(page).toHaveURL('/sign-in');
};
