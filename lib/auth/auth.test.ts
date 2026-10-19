import { describe, expect, it } from 'vitest';
import type { EmailMessage, SendEmail } from '@/lib/email/transport';
import { migratedDatabasePerTest } from '@/test/db';
import { createAuth } from './auth.ts';
import { resolveCaller } from './caller.ts';

const database = migratedDatabasePerTest();

const baseUrl = 'http://macros.example.test';

const email = 'eater@example.test';

const password = 'lentils-and-rice-forever';

const authWithOutbox = () => {
  const sent: EmailMessage[] = [];
  const sendEmail: SendEmail = async (message) => {
    sent.push(message);
    return { delivered: true, id: `msg-${sent.length}` };
  };
  const auth = createAuth({
    db: database(),
    secret: 'a-secret-only-these-tests-sign-with-0123456789',
    baseUrl,
    sendEmail,
  });
  return { auth, sent };
};

const linkIn = ({ text }: EmailMessage) => {
  const found = text.match(/https?:\/\/\S+/);
  if (!found) {
    throw new Error(`no link in: ${text}`);
  }
  return found[0];
};

const signUp = (auth: ReturnType<typeof createAuth>) =>
  auth.api.signUpEmail({
    body: { email, password, name: 'eater', callbackURL: '/verify' },
  });

const signIn = (auth: ReturnType<typeof createAuth>, secret = password) =>
  auth.api.signInEmail({
    body: { email, password: secret },
    asResponse: true,
  });

const cookieOf = (response: Response) =>
  new Headers({ cookie: response.headers.getSetCookie().join('; ') });

const follow = (auth: ReturnType<typeof createAuth>, url: string) =>
  auth.handler(new Request(url));

describe('createAuth', () => {
  it('mails a confirmation link on sign-up and opens no session', async () => {
    const { auth, sent } = authWithOutbox();

    const result = await signUp(auth);

    expect(result.token).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(email);
    expect(linkIn(sent[0] as EmailMessage)).toMatch(
      `${baseUrl}/api/auth/verify-email?token=`,
    );
  });

  it('refuses to sign in an address that is not confirmed', async () => {
    const { auth } = authWithOutbox();
    await signUp(auth);

    const response = await signIn(auth);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('confirms the address from the mailed link and signs the account in', async () => {
    const { auth, sent } = authWithOutbox();
    await signUp(auth);

    const response = await follow(auth, linkIn(sent[0] as EmailMessage));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/verify');
    expect(await resolveCaller(cookieOf(response), auth)).toEqual({
      userId: expect.any(String),
    });
  });

  it('signs in a confirmed account with its password', async () => {
    const { auth, sent } = authWithOutbox();
    await signUp(auth);
    await follow(auth, linkIn(sent[0] as EmailMessage));

    const response = await signIn(auth);

    expect(response.status).toBe(200);
    const caller = await resolveCaller(cookieOf(response), auth);
    const user = await database()
      .selectFrom('users')
      .select(['id', 'email_verified'])
      .where('email', '=', email)
      .executeTakeFirstOrThrow();
    expect(caller).toEqual({ userId: user.id });
    expect(user.email_verified).toBe(1);
  });

  it('sends a link back to its own page when the confirmation link is spoiled', async () => {
    const { auth } = authWithOutbox();

    const response = await follow(
      auth,
      `${baseUrl}/api/auth/verify-email?token=nonsense&callbackURL=%2Fverify%3Fnext%3D%252Fdiary`,
    );

    expect(response.headers.get('location')).toBe(
      '/verify?next=%2Fdiary&error=INVALID_TOKEN',
    );
  });

  it('mails a reset link that sets a new password and signs out every session', async () => {
    const { auth, sent } = authWithOutbox();
    await signUp(auth);
    await follow(auth, linkIn(sent[0] as EmailMessage));
    const before = cookieOf(await signIn(auth));

    await auth.api.requestPasswordReset({
      body: { email, redirectTo: '/reset-password' },
    });
    const reset = await follow(auth, linkIn(sent[1] as EmailMessage));
    const token = new URL(
      reset.headers.get('location') ?? '',
      baseUrl,
    ).searchParams.get('token');
    await auth.api.resetPassword({
      body: { token: token ?? '', newPassword: 'beans-on-toast-every-day' },
    });

    expect(sent[1]?.subject).toMatch(/Reset your .* password/);
    expect(await resolveCaller(before, auth)).toBeNull();
    expect((await signIn(auth)).status).toBe(401);
    expect((await signIn(auth, 'beans-on-toast-every-day')).status).toBe(200);
  });

  it('mails nothing when someone asks to reset an address with no account', async () => {
    const { auth, sent } = authWithOutbox();

    await auth.api.requestPasswordReset({
      body: { email, redirectTo: '/reset-password' },
    });

    expect(sent).toEqual([]);
  });

  it('answers a sign-up on a registered address as it would a new one', async () => {
    const { auth, sent } = authWithOutbox();
    await signUp(auth);

    const again = await signUp(auth);

    expect(again.token).toBeNull();
    expect(again.user.email).toBe(email);
    expect(sent).toHaveLength(1);
  });

  it('has no caller without a session', async () => {
    const { auth } = authWithOutbox();

    expect(await resolveCaller(new Headers(), auth)).toBeNull();
  });
});
