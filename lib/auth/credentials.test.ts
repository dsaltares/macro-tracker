import { describe, expect, it } from 'vitest';
import {
  displayNameFor,
  maxPasswordLength,
  minPasswordLength,
  newPasswordSchema,
  signUpSchema,
  termsRequired,
} from './credentials.ts';

const issuesOf = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map(({ message }) => message) ?? [];

describe('signUpSchema', () => {
  it('lowercases and trims the address', () => {
    const parsed = signUpSchema.parse({
      email: '  Eater@Example.TEST ',
      password: 'a'.repeat(minPasswordLength),
      confirmPassword: 'a'.repeat(minPasswordLength),
      termsAccepted: true,
    });

    expect(parsed.email).toBe('eater@example.test');
  });

  it('refuses an address that is not one', () => {
    expect(
      issuesOf(
        signUpSchema.safeParse({
          email: 'eater',
          password: 'a'.repeat(minPasswordLength),
          confirmPassword: 'a'.repeat(minPasswordLength),
          termsAccepted: true,
        }),
      ),
    ).toEqual(['That does not look like an email address.']);
  });

  it('refuses a sign-up that does not agree to the terms', () => {
    expect(
      issuesOf(
        signUpSchema.safeParse({
          email: 'eater@example.test',
          password: 'a'.repeat(minPasswordLength),
          confirmPassword: 'a'.repeat(minPasswordLength),
          termsAccepted: false,
        }),
      ),
    ).toEqual([termsRequired]);
  });
});

describe('newPasswordSchema', () => {
  it.each([
    [minPasswordLength - 1, `Use at least ${minPasswordLength} characters.`],
    [maxPasswordLength + 1, `Keep it under ${maxPasswordLength} characters.`],
  ])('refuses a password of %i characters', (length, message) => {
    const password = 'a'.repeat(length);

    expect(
      issuesOf(
        newPasswordSchema.safeParse({ password, confirmPassword: password }),
      ),
    ).toEqual([message]);
  });

  it('refuses two passwords that differ', () => {
    expect(
      issuesOf(
        newPasswordSchema.safeParse({
          password: 'a'.repeat(minPasswordLength),
          confirmPassword: 'b'.repeat(minPasswordLength),
        }),
      ),
    ).toEqual(['Those two passwords do not match.']);
  });
});

describe('displayNameFor', () => {
  it('is the part of the address before the @', () => {
    expect(displayNameFor('eater@example.test')).toBe('eater');
  });
});
