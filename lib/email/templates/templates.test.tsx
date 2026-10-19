import { describe, expect, it } from 'vitest';
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
