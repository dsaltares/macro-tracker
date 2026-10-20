'use client';

import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: { termsAccepted: { type: 'boolean', required: true } },
    }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  linkSocial,
  useSession,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} = authClient;
