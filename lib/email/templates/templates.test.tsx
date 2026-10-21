import { describe, expect, it } from 'vitest';
import { historyImportEmail } from './history-import.tsx';
import { resetPasswordCopy, resetPasswordEmail } from './reset-password.tsx';
import { verifyAddressCopy, verifyAddressEmail } from './verify-address.tsx';

const to = 'eater@example.test';

const templates = [
  {
    name: 'verifyAddressEmail',
    build: verifyAddressEmail,
    copy: verifyAddressCopy,
    url: 'https://macros.example.test/api/auth/verify-email?token=abc123&callbackURL=%2Fverify',
  },
  {
    name: 'resetPasswordEmail',
    build: resetPasswordEmail,
    copy: resetPasswordCopy,
    url: 'https://macros.example.test/api/auth/reset-password/abc123?callbackURL=%2Freset-password',
  },
];

describe.each(templates)('$name', ({ build, copy, url }) => {
  it('addresses the recipient under its subject', async () => {
    const message = await build({ to, url });

    expect(message.to).toBe(to);
    expect(message.subject).toBe(copy.subject);
  });

  it('links the url from the button and from the fallback', async () => {
    const { html } = await build({ to, url });

    expect(html).toContain(copy.button);
    expect(html.split(`href="${url.replaceAll('&', '&amp;')}"`)).toHaveLength(
      3,
    );
  });

  it('carries the url and the expiry in a plain text part', async () => {
    const { text } = await build({ to, url });

    expect(text).toContain(url);
    expect(text).toContain('expires in an hour');
    expect(text).not.toContain('<');
  });
});

describe('historyImportEmail', () => {
  const summary = {
    days: 59,
    skippedDays: 1,
    entries: 1175,
    quickEntries: 26,
    skippedEntries: 0,
    failedMeals: 0,
    weights: 1,
    skippedWeights: 0,
    sourceKcal: 130224,
    importedKcal: 130442,
    foods: [],
  };

  it('sums up a finished import and links to it', async () => {
    const message = await historyImportEmail({
      to: 'user@example.test',
      url: 'https://macros.example.test/settings/import',
      outcome: { status: 'succeeded', summary },
    });

    expect(message.subject).toBe('Your import finished');
    expect(message.text).toContain(
      '1,175 entries over 59 days and 1 weight are in your diary, skipping 1 day you had already logged.',
    );
    expect(message.text).toContain(
      'https://macros.example.test/settings/import',
    );
  });

  it('says why an import stopped', async () => {
    const message = await historyImportEmail({
      to: 'user@example.test',
      url: 'https://macros.example.test/settings/import',
      outcome: { status: 'failed', error: 'Cronometer is down.' },
    });

    expect(message.subject).toBe('Your import stopped');
    expect(message.text).toContain('Cronometer is down.');
  });
});
