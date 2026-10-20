import { vi } from 'vitest';

type Outcome = { error?: { code?: string; message?: string; status?: number } };

const succeeds = (): Outcome => ({});

export const signIn = {
  email: vi.fn(succeeds),
  social: vi.fn(succeeds),
};
export const signUp = { email: vi.fn(succeeds) };
export const signOut = vi.fn(succeeds);
export const linkSocial = vi.fn(succeeds);
export const requestPasswordReset = vi.fn(succeeds);
export const resetPassword = vi.fn(succeeds);
export const sendVerificationEmail = vi.fn(succeeds);
