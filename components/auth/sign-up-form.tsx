'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthForm } from '@/components/auth/auth-form';
import { PasswordField, TextField } from '@/components/auth/fields';
import { signUp } from '@/lib/auth/client';
import {
  displayNameFor,
  passwordHint,
  type SignUpCredentials,
  signUpSchema,
} from '@/lib/auth/credentials';
import { authErrorMessage } from '@/lib/auth/errors';
import { authUrl, emailParam, nextParam } from '@/lib/auth/redirect';
import { routes } from '@/lib/routes';

export function SignUpForm({ google }: { google: boolean }) {
  const router = useRouter();
  const next = useSearchParams().get(nextParam);
  const [failure, setFailure] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpCredentials>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFailure(undefined);

    const { error } = await signUp.email({
      email,
      password,
      name: displayNameFor(email),
      callbackURL: authUrl(routes.verify, next),
    });
    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }

    router.push(authUrl(routes.verify, next, { [emailParam]: email }));
  });

  return (
    <AuthForm
      onSubmit={onSubmit}
      error={failure}
      submit="Create account"
      working="Creating your account…"
      pending={isSubmitting}
      next={next}
      google={google}
      footer={{
        prompt: 'Already have an account?',
        href: routes.signIn,
        label: 'Sign in',
      }}
    >
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="new-password"
        hint={passwordHint}
        error={errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Repeat password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
    </AuthForm>
  );
}
