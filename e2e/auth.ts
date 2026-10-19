import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { readOutbox } from '../lib/email/outbox.ts';
import { e2eOutboxDir } from '../playwright.config.ts';

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

export const signedInAs = (page: Page, email: string) =>
  expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

export const signOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/sign-in');
};
