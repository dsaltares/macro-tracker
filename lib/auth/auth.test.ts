import { describe, expect, it } from 'vitest';
import type { EmailMessage, SendEmail } from '@/lib/email/transport';
import { migratedDatabasePerTest } from '@/test/db';
import { createCaller } from '../trpc/root.ts';
import { lastSignInMethod } from '../trpc/routers/account.ts';
import { createAuth } from './auth.ts';
import { resolveCaller } from './caller.ts';
import { termsNotAccepted } from './credentials.ts';
import { usesGoogleCode } from './errors.ts';
import type { GoogleOptions } from './google.ts';

const database = migratedDatabasePerTest();

const baseUrl = 'http://macros.example.test';

const email = 'eater@example.test';

const password = 'lentils-and-rice-forever';

const googleClientId = 'a-test-google-client-id';

const google = (verified = true, address = email): GoogleOptions => ({
  clientId: googleClientId,
  clientSecret: 'a-test-google-client-secret',
  verifyIdToken: async () => true,
  getUserInfo: async () => ({
    user: { name: 'Eater', email: address, emailVerified: verified },
    data: {
      aud: googleClientId,
      azp: googleClientId,
      email: address,
      email_verified: verified,
      exp: 0,
      family_name: '',
      given_name: 'Eater',
      iat: 0,
      iss: 'https://accounts.google.com',
      name: 'Eater',
      picture: 'https://example.test/eater.png',
      sub: 'google-subject-1',
    },
  }),
});

const authWithOutbox = (googleOptions = google()) => {
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
    google: googleOptions,
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

const signUp = (
  auth: ReturnType<typeof createAuth>,
  consent: { termsAccepted?: boolean } = { termsAccepted: true },
) =>
  auth.api.signUpEmail({
    body: {
      email,
      password,
      name: 'eater',
      callbackURL: '/verify',
      ...consent,
    },
  });

const signIn = (auth: ReturnType<typeof createAuth>, secret = password) =>
  auth.handler(
    new Request(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ email, password: secret }),
    }),
  );

const signInWithGoogle = (
  auth: ReturnType<typeof createAuth>,
  additionalData: Record<string, unknown> = {},
) =>
  auth.api.signInSocial({
    body: {
      provider: 'google',
      idToken: { token: 'a-stub-id-token' },
      additionalData,
    },
    asResponse: true,
  });

const agreed = { termsAccepted: true };

const accountsOf = () =>
  database()
    .selectFrom('users')
    .innerJoin('accounts', 'accounts.user_id', 'users.id')
    .select(['users.id', 'users.email_verified', 'accounts.provider_id'])
    .orderBy('accounts.provider_id')
    .execute();

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

  it('records when the terms were agreed to at sign-up', async () => {
    const { auth } = authWithOutbox();
    const before = new Date();

    await signUp(auth);

    const { terms_accepted_at } = await database()
      .selectFrom('users')
      .select('terms_accepted_at')
      .where('email', '=', email)
      .executeTakeFirstOrThrow();
    expect(new Date(terms_accepted_at ?? 0).getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });

  it.each([
    ['without agreeing to the terms', {}],
    ['having declined the terms', { termsAccepted: false }],
  ])('refuses a sign-up %s, and mails nothing', async (_, consent) => {
    const { auth, sent } = authWithOutbox();

    await expect(signUp(auth, consent)).rejects.toMatchObject({
      body: { code: 'TERMS_NOT_ACCEPTED' },
    });

    expect(await database().selectFrom('users').select('id').execute()).toEqual(
      [],
    );
    expect(sent).toEqual([]);
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

describe('signing in with Google', () => {
  it('opens an account for an address nobody has signed up with, once the terms are agreed', async () => {
    const { auth, sent } = authWithOutbox();

    const response = await signInWithGoogle(auth, agreed);

    expect(response.status).toBe(200);
    expect(await accountsOf()).toEqual([
      { id: expect.any(String), email_verified: 1, provider_id: 'google' },
    ]);
    expect(await resolveCaller(cookieOf(response), auth)).toEqual({
      userId: expect.any(String),
    });
    expect(sent).toEqual([]);
    const { terms_accepted_at } = await database()
      .selectFrom('users')
      .select('terms_accepted_at')
      .executeTakeFirstOrThrow();
    expect(terms_accepted_at).not.toBeNull();
  });

  it('opens no account through Google without the terms agreed', async () => {
    const { auth } = authWithOutbox();

    const response = await signInWithGoogle(auth);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: termsNotAccepted });
    expect(await accountsOf()).toEqual([]);
  });

  it('attaches Google to the confirmed password account on the same address', async () => {
    const { auth, sent } = authWithOutbox();
    await signUp(auth);
    await follow(auth, linkIn(sent[0] as EmailMessage));

    const response = await signInWithGoogle(auth);

    const accounts = await accountsOf();
    expect(accounts.map(({ provider_id }) => provider_id)).toEqual([
      'credential',
      'google',
    ]);
    expect(new Set(accounts.map(({ id }) => id)).size).toBe(1);
    expect(await resolveCaller(cookieOf(response), auth)).toEqual({
      userId: accounts[0]?.id,
    });
    expect((await signIn(auth)).status).toBe(200);
  });

  it('confirms an unconfirmed address and drops the password nobody proved they own', async () => {
    const { auth } = authWithOutbox();
    const { user } = await signUp(auth);

    const response = await signInWithGoogle(auth);

    expect(await accountsOf()).toEqual([
      { id: user.id, email_verified: 1, provider_id: 'google' },
    ]);
    expect(await resolveCaller(cookieOf(response), auth)).toEqual({
      userId: user.id,
    });
    expect(await (await signIn(auth)).json()).toMatchObject({
      code: usesGoogleCode,
    });
  });

  it('refuses to attach a Google address Google has not confirmed', async () => {
    const { auth, sent } = authWithOutbox(google(false));
    await signUp(auth);
    await follow(auth, linkIn(sent[0] as EmailMessage));

    const response = await signInWithGoogle(auth);

    expect(response.status).toBe(401);
    expect((await accountsOf()).map(({ provider_id }) => provider_id)).toEqual([
      'credential',
    ]);
  });

  it('tells a password sign-in on a Google-only account to use Google', async () => {
    const { auth } = authWithOutbox();
    await signInWithGoogle(auth, agreed);

    const response = await signIn(auth);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: usesGoogleCode });
  });

  it('answers a password sign-in on an unknown address as a wrong password', async () => {
    const { auth } = authWithOutbox();

    const response = await signIn(auth);

    expect(await response.json()).toMatchObject({
      code: 'INVALID_EMAIL_OR_PASSWORD',
    });
  });
});

const linkGoogle = (auth: ReturnType<typeof createAuth>, headers: Headers) =>
  auth.api.linkSocialAccount({
    body: { provider: 'google', idToken: { token: 'a-stub-id-token' } },
    headers,
  });

const confirmedSignUp = async (
  auth: ReturnType<typeof createAuth>,
  sent: EmailMessage[],
) => {
  await signUp(auth);
  return follow(auth, linkIn(sent[0] as EmailMessage));
};

const accountAs = async (
  auth: ReturnType<typeof createAuth>,
  response: Response,
) => {
  const caller = await resolveCaller(cookieOf(response), auth);
  let ids = 0;
  return createCaller({
    db: database(),
    caller,
    now: () => new Date().toISOString(),
    nextId: () => `id-${++ids}`,
  });
};

describe('managing sign-in methods', () => {
  it('connects Google to a password account from its session', async () => {
    const { auth, sent } = authWithOutbox();
    const confirmed = await confirmedSignUp(auth, sent);

    await linkGoogle(auth, cookieOf(confirmed));

    const accounts = await accountsOf();
    expect(accounts.map(({ provider_id }) => provider_id)).toEqual([
      'credential',
      'google',
    ]);
    expect(new Set(accounts.map(({ id }) => id)).size).toBe(1);
    expect(
      await (await accountAs(auth, confirmed)).account.signInMethods(),
    ).toEqual({ password: true, google: true });
  });

  it('refuses to connect a Google account on another address', async () => {
    const { auth, sent } = authWithOutbox(
      google(true, 'someone-else@example.test'),
    );
    const confirmed = await confirmedSignUp(auth, sent);

    await expect(linkGoogle(auth, cookieOf(confirmed))).rejects.toMatchObject({
      body: { code: 'LINKING_DIFFERENT_EMAILS_NOT_ALLOWED' },
    });
    expect((await accountsOf()).map(({ provider_id }) => provider_id)).toEqual([
      'credential',
    ]);
  });

  it('sets a password on a Google account, which then signs in with it', async () => {
    const { auth } = authWithOutbox();
    const signedIn = await signInWithGoogle(auth, agreed);
    const account = await accountAs(auth, signedIn);

    await account.account.setPassword({
      password,
      confirmPassword: password,
    });

    expect(await account.account.signInMethods()).toEqual({
      password: true,
      google: true,
    });
    const response = await signIn(auth);
    expect(response.status).toBe(200);
    expect(await resolveCaller(cookieOf(response), auth)).toEqual(
      await resolveCaller(cookieOf(signedIn), auth),
    );
  });

  it('disconnects Google, and then the password signs in alone', async () => {
    const { auth, sent } = authWithOutbox();
    const confirmed = await confirmedSignUp(auth, sent);
    await linkGoogle(auth, cookieOf(confirmed));
    const account = await accountAs(auth, confirmed);

    await account.account.disconnect({ method: 'google' });

    expect((await accountsOf()).map(({ provider_id }) => provider_id)).toEqual([
      'credential',
    ]);
    expect((await signIn(auth)).status).toBe(200);
  });

  it('disconnects the password, and then a password sign-in is told to use Google', async () => {
    const { auth } = authWithOutbox();
    const signedIn = await signInWithGoogle(auth, agreed);
    const account = await accountAs(auth, signedIn);
    await account.account.setPassword({
      password,
      confirmPassword: password,
    });

    await account.account.disconnect({ method: 'password' });

    expect(await (await signIn(auth)).json()).toMatchObject({
      code: usesGoogleCode,
    });
  });

  it.each([
    ['the password', 'password'],
    ['Google', 'google'],
  ] as const)(
    'refuses to disconnect %s when it is the only method left',
    async (_, method) => {
      const { auth, sent } = authWithOutbox();
      const signedIn =
        method === 'google'
          ? await signInWithGoogle(auth, agreed)
          : await confirmedSignUp(auth, sent);
      const before = await accountsOf();

      await expect(
        (await accountAs(auth, signedIn)).account.disconnect({ method }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: lastSignInMethod,
      });
      expect(await accountsOf()).toEqual(before);
    },
  );
});
